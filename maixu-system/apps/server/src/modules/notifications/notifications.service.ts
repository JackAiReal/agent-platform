import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationChannel, NotificationStatus, Prisma, RoleCode } from '@prisma/client';
import { DemoStoreService } from '../../common/demo/demo-store.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { WsGateway } from '../../infrastructure/ws/ws.gateway';

type LeaveNoticeWithRelations = Prisma.LeaveNoticeGetPayload<{
  include: {
    user: true;
    roomSlot: true;
  };
}>;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private timeoutCheckRunning = false;
  private dispatchRunning = false;

  private metrics = {
    cronRuns: 0,
    cronFailures: 0,
    lastCronRunAt: null as string | null,
    lastCronSuccessAt: null as string | null,
    lastCronFailureAt: null as string | null,
    lastCronFailureMessage: null as string | null,
    totalTimeoutHandled: 0,
    totalLogsCreated: 0,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly demoStoreService: DemoStoreService,
    private readonly wsGateway: WsGateway,
  ) {}

  private get useDemoMode() {
    return !process.env.DATABASE_URL;
  }

  getHealth() {
    return { module: 'notifications', ok: true };
  }

  async getMetrics() {
    if (this.useDemoMode) {
      return {
        ...this.metrics,
        pendingCount: 0,
        failedCount: 0,
      };
    }

    const [pendingCount, failedCount] = await Promise.all([
      this.prisma.notificationLog.count({ where: { status: NotificationStatus.PENDING } }),
      this.prisma.notificationLog.count({ where: { status: NotificationStatus.FAILED } }),
    ]);

    return {
      ...this.metrics,
      pendingCount,
      failedCount,
    };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async autoCheckLeaveNoticeTimeoutsEveryMinute() {
    const enabled = (process.env.NOTIFICATION_TIMEOUT_CRON_ENABLED ?? 'true').toLowerCase() !== 'false';
    const everyMinutes = Math.max(1, Number(process.env.NOTIFICATION_TIMEOUT_EVERY_MINUTES ?? '1'));

    if (!enabled) return;

    const currentMinute = new Date().getMinutes();
    if (currentMinute % everyMinutes !== 0) return;

    if (this.timeoutCheckRunning) return;
    this.timeoutCheckRunning = true;

    this.metrics.cronRuns += 1;
    this.metrics.lastCronRunAt = new Date().toISOString();

    try {
      const result = await this.checkLeaveNoticeTimeouts();
      await this.dispatchPendingNotifications(100);

      this.metrics.totalTimeoutHandled += result.timeoutCount;
      this.metrics.totalLogsCreated += result.logsCreated;
      this.metrics.lastCronSuccessAt = new Date().toISOString();

      if (result.timeoutCount > 0) {
        this.logger.log(
          `leave timeout auto-check handled ${result.timeoutCount} notice(s), logs=${result.logsCreated}`,
        );
      }
    } catch (error) {
      const message = (error as Error)?.message || String(error);
      this.metrics.cronFailures += 1;
      this.metrics.lastCronFailureAt = new Date().toISOString();
      this.metrics.lastCronFailureMessage = message;
      this.logger.warn(`leave timeout auto-check failed: ${message}`);
      await this.sendAlert(`leave timeout auto-check failed: ${message}`);
    } finally {
      this.timeoutCheckRunning = false;
    }
  }

  async checkLeaveNoticeTimeouts(payload?: { slotId?: string; dryRun?: boolean; simulateNowOffsetSeconds?: number }) {
    if (this.useDemoMode) {
      return {
        checkedCount: 0,
        timeoutCount: 0,
        logsCreated: 0,
        dryRun: Boolean(payload?.dryRun),
      };
    }

    const offsetSeconds = Number(payload?.simulateNowOffsetSeconds || 0);
    const now = new Date(Date.now() + (Number.isFinite(offsetSeconds) ? offsetSeconds : 0) * 1000);
    const dryRun = Boolean(payload?.dryRun);

    const overdue = await this.prisma.leaveNotice.findMany({
      where: {
        status: 'ACTIVE',
        returnDeadline: {
          lte: now,
        },
        ...(payload?.slotId ? { roomSlotId: payload.slotId } : {}),
      },
      include: {
        user: true,
        roomSlot: true,
      },
      orderBy: { returnDeadline: 'asc' },
      take: 200,
    });

    let logsCreated = 0;

    for (const item of overdue) {
      if (dryRun) continue;

      const created = await this.createLeaveNoticeTimeoutLogs(item);
      logsCreated += created;

      await this.prisma.leaveNotice.update({
        where: { id: item.id },
        data: {
          status: 'EXPIRED',
          remindCount: {
            increment: 1,
          },
        },
      });

      await this.emitLeaveNoticeTimeout(item.roomSlotId, item.id, item.userId);
    }

    if (!dryRun) {
      await this.dispatchPendingNotifications(200);
    }

    return {
      checkedCount: overdue.length,
      timeoutCount: overdue.length,
      logsCreated,
      dryRun,
    };
  }

  async listLogs(payload?: { status?: NotificationStatus; limit?: number }) {
    const take = Math.max(1, Math.min(200, Number(payload?.limit) || 50));

    if (this.useDemoMode) {
      return [];
    }

    return this.prisma.notificationLog.findMany({
      where: {
        ...(payload?.status ? { status: payload.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async dispatchPendingNotifications(limit = 100) {
    if (this.useDemoMode) return { dispatched: 0, failed: 0, skipped: 0 };
    if (this.dispatchRunning) return { dispatched: 0, failed: 0, skipped: 0 };

    this.dispatchRunning = true;

    try {
      const rows = await this.prisma.notificationLog.findMany({
        where: { status: NotificationStatus.PENDING },
        orderBy: { createdAt: 'asc' },
        take: Math.max(1, Math.min(500, limit)),
      });

      let dispatched = 0;
      let failed = 0;
      let skipped = 0;

      for (const row of rows) {
        const result = await this.deliverNotification(row.channel, row.templateCode || '', row.payload as Prisma.JsonObject);

        if (result.ok) {
          dispatched += 1;
          await this.prisma.notificationLog.update({
            where: { id: row.id },
            data: {
              status: NotificationStatus.SENT,
              errorMessage: null,
            },
          });
        } else if (result.skip) {
          skipped += 1;
          await this.prisma.notificationLog.update({
            where: { id: row.id },
            data: {
              status: NotificationStatus.PENDING,
              errorMessage: result.message || 'skipped by channel config',
            },
          });
        } else {
          failed += 1;
          await this.prisma.notificationLog.update({
            where: { id: row.id },
            data: {
              status: NotificationStatus.FAILED,
              errorMessage: result.message || 'unknown error',
            },
          });
        }
      }

      return { dispatched, failed, skipped };
    } finally {
      this.dispatchRunning = false;
    }
  }

  private async createLeaveNoticeTimeoutLogs(notice: LeaveNoticeWithRelations) {
    const logs: Array<Prisma.NotificationLogCreateManyInput> = [];

    logs.push({
      userId: notice.userId,
      channel: NotificationChannel.INBOX,
      templateCode: 'leave_notice_timeout_user',
      payload: {
        type: 'leave_notice_timeout',
        roomSlotId: notice.roomSlotId,
        leaveNoticeId: notice.id,
        returnDeadline: notice.returnDeadline.toISOString(),
      } as Prisma.InputJsonObject,
      status: NotificationStatus.PENDING,
    });

    const hostUsers = await this.prisma.userRoomRole.findMany({
      where: {
        roomId: notice.roomSlot.roomId,
        roleCode: {
          in: [RoleCode.HOST, RoleCode.ROOM_ADMIN, RoleCode.SUPER_ADMIN],
        },
      },
      distinct: ['userId'],
      select: {
        userId: true,
      },
    });

    for (const host of hostUsers) {
      logs.push({
        userId: host.userId,
        channel: NotificationChannel.INBOX,
        templateCode: 'leave_notice_timeout_host',
        payload: {
          type: 'leave_notice_timeout',
          roomId: notice.roomSlot.roomId,
          roomSlotId: notice.roomSlotId,
          leaveNoticeId: notice.id,
          targetUserId: notice.userId,
          targetNickname: notice.user.nickname,
          returnDeadline: notice.returnDeadline.toISOString(),
        } as Prisma.InputJsonObject,
        status: NotificationStatus.PENDING,
      });

      if (process.env.WECOM_WEBHOOK_URL) {
        logs.push({
          userId: host.userId,
          channel: NotificationChannel.WECOM,
          templateCode: 'leave_notice_timeout_host',
          payload: {
            type: 'leave_notice_timeout',
            roomId: notice.roomSlot.roomId,
            roomSlotId: notice.roomSlotId,
            leaveNoticeId: notice.id,
            targetUserId: notice.userId,
            targetNickname: notice.user.nickname,
            returnDeadline: notice.returnDeadline.toISOString(),
          } as Prisma.InputJsonObject,
          status: NotificationStatus.PENDING,
        });
      }
    }

    if (logs.length === 0) return 0;

    const result = await this.prisma.notificationLog.createMany({ data: logs });
    return result.count;
  }

  private async deliverNotification(channel: NotificationChannel, templateCode: string, payload: Prisma.JsonObject) {
    if (channel === NotificationChannel.INBOX) {
      return { ok: true } as const;
    }

    if (channel === NotificationChannel.WECOM) {
      const webhook = process.env.WECOM_WEBHOOK_URL;
      if (!webhook) {
        return { ok: false, skip: true, message: 'WECOM_WEBHOOK_URL not configured' } as const;
      }

      const text = this.buildNotificationText(templateCode, payload);
      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'text',
          text: {
            content: text,
          },
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        return { ok: false, message: `wecom webhook failed: ${response.status} ${body}` } as const;
      }

      return { ok: true } as const;
    }

    if (channel === NotificationChannel.MINIAPP) {
      return { ok: false, skip: true, message: 'miniapp delivery not configured' } as const;
    }

    return { ok: false, message: `unsupported channel: ${channel}` } as const;
  }

  private buildNotificationText(templateCode: string, payload: Prisma.JsonObject) {
    if (templateCode === 'leave_notice_timeout_host') {
      return `【报备超时提醒】用户 ${payload.targetNickname || payload.targetUserId} 已超时未回厅，档位 ${payload.roomSlotId}`;
    }

    if (templateCode === 'leave_notice_timeout_user') {
      return `【报备超时提醒】你的暂离报备已超时，请尽快回厅。`;
    }

    return `【通知】${templateCode} ${JSON.stringify(payload)}`;
  }

  private async sendAlert(message: string) {
    const webhook = process.env.WECOM_WEBHOOK_URL;
    if (!webhook) return;

    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'text',
          text: {
            content: `【系统告警】${message}`,
          },
        }),
      });
    } catch {
      // ignore secondary failures
    }
  }

  private async emitLeaveNoticeTimeout(slotId: string, leaveNoticeId: string, userId: string) {
    const slot = await this.prisma.roomSlot.findUnique({ where: { id: slotId } });
    if (!slot) return;

    const snapshot = await this.buildLeaveNoticeSnapshot(slotId);

    const timeoutPayload = {
      slotId,
      roomId: slot.roomId,
      leaveNoticeId,
      userId,
      timeoutAt: new Date().toISOString(),
    };

    this.wsGateway.emitToRoom(slot.roomId, 'leave-notice.timeout', timeoutPayload);
    this.wsGateway.emitToSlot(slotId, 'leave-notice.timeout', timeoutPayload);

    this.wsGateway.emitToRoom(slot.roomId, 'leave-notice.updated', snapshot);
    this.wsGateway.emitToSlot(slotId, 'leave-notice.updated', snapshot);
  }

  private async buildLeaveNoticeSnapshot(slotId: string) {
    const notices = await this.prisma.leaveNotice.findMany({
      where: { roomSlotId: slotId },
      include: { user: true },
      orderBy: { startAt: 'desc' },
      take: 20,
    });

    const mapped = notices.map((notice) => ({
      id: notice.id,
      roomSlotId: notice.roomSlotId,
      userId: notice.userId,
      user: {
        id: notice.user.id,
        nickname: notice.user.nickname,
        avatarUrl: notice.user.avatarUrl,
        createdAt: notice.user.createdAt,
      },
      status: notice.status,
      startAt: notice.startAt,
      returnDeadline: notice.returnDeadline,
      returnedAt: notice.returnedAt,
      remindCount: notice.remindCount,
      metadata: notice.metadata,
      createdAt: notice.createdAt,
      updatedAt: notice.updatedAt,
    }));

    return {
      slotId,
      activeNotices: mapped.filter((item) => item.status === 'ACTIVE'),
      allNotices: mapped,
      updatedAt: new Date().toISOString(),
    };
  }
}
