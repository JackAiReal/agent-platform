import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LeaveNoticeStatus, Prisma } from '@prisma/client';
import { DemoStoreService } from '../../common/demo/demo-store.service';
import { WsGateway } from '../../infrastructure/ws/ws.gateway';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RankRepository } from '../rank/repositories/rank.repository';
import { SlotsRepository } from '../slots/repositories/slots.repository';

type LeaveNoticeWithUser = Prisma.LeaveNoticeGetPayload<{
  include: { user: true };
}>;

@Injectable()
export class LeaveNoticesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demoStoreService: DemoStoreService,
    private readonly slotsRepository: SlotsRepository,
    private readonly rankRepository: RankRepository,
    private readonly wsGateway: WsGateway,
  ) {}

  private get useDemoMode() {
    return !process.env.DATABASE_URL;
  }

  getHealth() {
    return { module: 'leave-notices', ok: true };
  }

  async listSlotNotices(slotId: string) {
    if (this.useDemoMode) {
      return this.demoStoreService.listLeaveNotices(slotId);
    }

    return this.buildDbSnapshot(slotId);
  }

  async getMyNotice(slotId: string, userId: string) {
    if (this.useDemoMode) {
      return {
        slotId,
        notice: this.demoStoreService.getMyActiveLeaveNotice(slotId, userId),
      };
    }

    await this.expireDbNotices(slotId);
    const notice = await this.prisma.leaveNotice.findFirst({
      where: {
        roomSlotId: slotId,
        userId,
        status: LeaveNoticeStatus.ACTIVE,
      },
      include: { user: true },
      orderBy: { startAt: 'desc' },
    });

    return {
      slotId,
      notice: notice ? this.mapDbNotice(notice) : null,
    };
  }

  async report(slotId: string, userId: string, payload: { minutes?: number; reason?: string }) {
    await this.slotsRepository.getSlot(slotId);
    await this.assertUserCanReport(slotId, userId);

    const minutes = this.normalizeMinutes(payload.minutes);
    const returnDeadline = new Date(Date.now() + minutes * 60 * 1000);

    if (this.useDemoMode) {
      const notice = this.demoStoreService.reportLeaveNotice({
        slotId,
        userId,
        returnDeadline,
        reason: payload.reason,
      });
      const snapshot = this.demoStoreService.listLeaveNotices(slotId);
      this.emitLeaveNoticeUpdated(slotId, snapshot);

      return {
        slotId,
        notice,
        snapshot,
      };
    }

    await this.expireDbNotices(slotId);

    const existing = await this.prisma.leaveNotice.findFirst({
      where: {
        roomSlotId: slotId,
        userId,
        status: LeaveNoticeStatus.ACTIVE,
      },
      orderBy: { startAt: 'desc' },
    });

    const metadata: Prisma.InputJsonValue | undefined = payload.reason
      ? ({ reason: payload.reason } as Prisma.InputJsonValue)
      : undefined;

    const notice = existing
      ? await this.prisma.leaveNotice.update({
          where: { id: existing.id },
          data: {
            returnDeadline,
            metadata,
          },
          include: { user: true },
        })
      : await this.prisma.leaveNotice.create({
          data: {
            roomSlotId: slotId,
            userId,
            returnDeadline,
            metadata,
          },
          include: { user: true },
        });

    const snapshot = await this.buildDbSnapshot(slotId);
    this.emitLeaveNoticeUpdated(slotId, snapshot);

    return {
      slotId,
      notice: this.mapDbNotice(notice),
      snapshot,
    };
  }

  async returnFromLeave(slotId: string, userId: string) {
    await this.slotsRepository.getSlot(slotId);

    if (this.useDemoMode) {
      const notice = this.demoStoreService.returnLeaveNotice({ slotId, userId });
      const snapshot = this.demoStoreService.listLeaveNotices(slotId);
      this.emitLeaveNoticeUpdated(slotId, snapshot);

      return {
        slotId,
        notice,
        snapshot,
      };
    }

    await this.expireDbNotices(slotId);

    const existing = await this.prisma.leaveNotice.findFirst({
      where: {
        roomSlotId: slotId,
        userId,
        status: LeaveNoticeStatus.ACTIVE,
      },
      orderBy: { startAt: 'desc' },
    });

    if (!existing) {
      throw new NotFoundException('active leave notice not found');
    }

    const notice = await this.prisma.leaveNotice.update({
      where: { id: existing.id },
      data: {
        status: LeaveNoticeStatus.RETURNED,
        returnedAt: new Date(),
      },
      include: { user: true },
    });

    const snapshot = await this.buildDbSnapshot(slotId);
    this.emitLeaveNoticeUpdated(slotId, snapshot);

    return {
      slotId,
      notice: this.mapDbNotice(notice),
      snapshot,
    };
  }

  private async assertUserCanReport(slotId: string, userId: string) {
    const rank = await this.rankRepository.getRank(slotId);
    const inRank = rank.entries.some((item) => item.userId === userId);

    if (!inRank) {
      throw new BadRequestException('only users currently in rank can create leave notice');
    }
  }

  private normalizeMinutes(value?: number) {
    const minutes = Number(value ?? 5);
    if (!Number.isFinite(minutes)) return 5;
    return Math.max(1, Math.min(60, Math.floor(minutes)));
  }

  private async expireDbNotices(slotId: string) {
    await this.prisma.leaveNotice.updateMany({
      where: {
        roomSlotId: slotId,
        status: LeaveNoticeStatus.ACTIVE,
        returnDeadline: {
          lte: new Date(),
        },
      },
      data: {
        status: LeaveNoticeStatus.EXPIRED,
      },
    });
  }

  private async buildDbSnapshot(slotId: string) {
    await this.slotsRepository.getSlot(slotId);
    await this.expireDbNotices(slotId);

    const notices = await this.prisma.leaveNotice.findMany({
      where: { roomSlotId: slotId },
      include: { user: true },
      orderBy: { startAt: 'desc' },
      take: 20,
    });

    const mapped = notices.map((item) => this.mapDbNotice(item));

    return {
      slotId,
      activeNotices: mapped.filter((item) => item.status === LeaveNoticeStatus.ACTIVE),
      allNotices: mapped,
      updatedAt: new Date().toISOString(),
    };
  }

  private mapDbNotice(notice: LeaveNoticeWithUser) {
    return {
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
    };
  }

  private async emitLeaveNoticeUpdated(slotId: string, snapshot: Record<string, unknown>) {
    const slot = await this.slotsRepository.getSlot(slotId);
    this.wsGateway.emitToRoom(slot.roomId, 'leave-notice.updated', snapshot);
    this.wsGateway.emitToSlot(slotId, 'leave-notice.updated', snapshot);
  }
}
