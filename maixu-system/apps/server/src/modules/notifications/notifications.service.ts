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

  @Cron(CronExpression.EVERY_MINUTE)
  async autoCheckLeaveNoticeTimeoutsEveryMinute() {
    const enabled = (process.env.NOTIFICATION_TIMEOUT_CRON_ENABLED ?? 'true').toLowerCase() !== 'false';
    const everyMinutes = Math.max(1, Number(process.env.NOTIFICATION_TIMEOUT_EVERY_MINUTES ?? '1'));

    if (!enabled) return;

    const currentMinute = new Date().getMinutes();
    if (currentMinute % everyMinutes !== 0) return;

    if (this.timeoutCheckRunning) return;
    this.timeoutCheckRunning = true;

    try {
      const result = await this.checkLeaveNoticeTimeouts();
      if (result.timeoutCount > 0) {
        this.logger.log(
          `leave timeout auto-check handled ${result.timeoutCount} notice(s), logs=${result.logsCreated}`,
        );
      }
    } catch (error) {
      this.logger.warn(`leave timeout auto-check failed: ${(error as Error)?.message || error}`);
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
      status: NotificationStatus.SENT,
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
        status: NotificationStatus.SENT,
      });
    }

    if (logs.length === 0) return 0;

    const result = await this.prisma.notificationLog.createMany({
      data: logs,
    });

    return result.count;
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
