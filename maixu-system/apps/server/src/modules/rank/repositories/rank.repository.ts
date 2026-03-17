import { Injectable, NotFoundException } from '@nestjs/common';
import { RankEntryStatus, RankSourceType } from '@prisma/client';
import { DemoStoreService } from '../../../common/demo/demo-store.service';
import { buildRuntimeRoomConfig } from '../../../common/utils/room-config.util';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

@Injectable()
export class RankRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demoStoreService: DemoStoreService,
  ) {}

  private get useDemoMode() {
    return !process.env.DATABASE_URL;
  }

  async getRank(slotId: string) {
    if (this.useDemoMode) {
      return this.demoStoreService.getRank(slotId);
    }

    const slot = await this.prisma.roomSlot.findUnique({
      where: { id: slotId },
      include: {
        room: {
          include: {
            configs: true,
          },
        },
      },
    });

    if (!slot) {
      throw new NotFoundException('slot not found');
    }

    const config = buildRuntimeRoomConfig(slot.room.configs);

    const entries = await this.prisma.rankEntry.findMany({
      where: {
        roomSlotId: slotId,
        status: RankEntryStatus.ACTIVE,
      },
      include: {
        user: true,
      },
      orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
    });

    const mappedEntries = entries.map((entry, index) => ({
      rank: index + 1,
      id: entry.id,
      roomSlotId: entry.roomSlotId,
      userId: entry.userId,
      user: {
        id: entry.user.id,
        nickname: entry.user.nickname,
        avatarUrl: entry.user.avatarUrl,
        createdAt: entry.user.createdAt,
      },
      sourceType: entry.sourceType,
      sourceContent: entry.sourceContent,
      score: Number(entry.score),
      status: entry.status,
      inTop: index < config.maxRank,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }));

    return {
      slot: {
        id: slot.id,
        roomId: slot.roomId,
        slotDate: slot.slotDate,
        slotHour: slot.slotHour,
        startAt: slot.startAt,
        speedCloseAt: slot.speedCloseAt,
        finalCloseAt: slot.finalCloseAt,
        state: slot.state,
        isFull: slot.isFull,
      },
      room: {
        id: slot.room.id,
        code: slot.room.code,
        name: slot.room.name,
        description: slot.room.description,
        isActive: slot.room.isActive,
        config,
      },
      entries: mappedEntries,
      topEntries: mappedEntries.slice(0, config.maxRank),
      maxRank: config.maxRank,
    };
  }

  async joinRank(payload: {
    slotId: string;
    userId: string;
    sourceContent: string;
    score: number;
    sourceType?: RankSourceType;
    isTop?: boolean;
    isBuy8?: boolean;
    isInsert?: boolean;
    allowLowerReplace?: boolean;
  }) {
    if (this.useDemoMode) {
      return this.demoStoreService.joinRank(payload);
    }

    const slot = await this.prisma.roomSlot.findUnique({
      where: { id: payload.slotId },
      include: {
        room: {
          include: { configs: true },
        },
      },
    });

    if (!slot) {
      throw new NotFoundException('slot not found');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      throw new NotFoundException('user not found');
    }

    const existing = await this.prisma.rankEntry.findFirst({
      where: {
        roomSlotId: payload.slotId,
        userId: payload.userId,
        status: RankEntryStatus.ACTIVE,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing && payload.score <= Number(existing.score) && !payload.allowLowerReplace) {
      return {
        accepted: false,
        reason: 'new score is not higher than current active score',
        entry: {
          ...existing,
          score: Number(existing.score),
        },
        rank: null,
      };
    }

    if (existing) {
      await this.prisma.rankEntry.update({
        where: { id: existing.id },
        data: { status: RankEntryStatus.REPLACED },
      });
    }

    const entry = await this.prisma.rankEntry.create({
      data: {
        roomSlotId: payload.slotId,
        userId: payload.userId,
        sourceType: payload.sourceType ?? RankSourceType.KEYWORD,
        sourceContent: payload.sourceContent,
        score: payload.score,
        isTop: Boolean(payload.isTop),
        isBuy8: Boolean(payload.isBuy8),
        isInsert: Boolean(payload.isInsert),
      },
    });

    const rank = await this.getRank(payload.slotId);
    const userRank = rank.entries.find((item) => item.userId === payload.userId)?.rank ?? null;

    await this.prisma.roomSlot.update({
      where: { id: payload.slotId },
      data: {
        isFull: rank.topEntries.length >= buildRuntimeRoomConfig(slot.room.configs).maxRank,
      },
    });

    return {
      accepted: true,
      reason: null,
      entry: {
        ...entry,
        score: Number(entry.score),
      },
      rank: userRank,
    };
  }

  async cancelRank(payload: { slotId: string; userId?: string; entryId?: string }) {
    if (this.useDemoMode) {
      return this.demoStoreService.cancelRank(payload);
    }

    const entry = await this.prisma.rankEntry.findFirst({
      where: {
        roomSlotId: payload.slotId,
        status: RankEntryStatus.ACTIVE,
        ...(payload.entryId ? { id: payload.entryId } : {}),
        ...(payload.userId ? { userId: payload.userId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!entry) {
      throw new NotFoundException('active rank entry not found');
    }

    const updated = await this.prisma.rankEntry.update({
      where: { id: entry.id },
      data: { status: RankEntryStatus.CANCELLED },
    });

    return {
      cancelled: true,
      entry: {
        ...updated,
        score: Number(updated.score),
      },
    };
  }

  async invalidateEntry(slotId: string, entryId: string) {
    if (this.useDemoMode) {
      return this.demoStoreService.invalidateEntry({ slotId, entryId });
    }

    const entry = await this.prisma.rankEntry.findFirst({
      where: {
        id: entryId,
        roomSlotId: slotId,
        status: RankEntryStatus.ACTIVE,
      },
    });

    if (!entry) {
      throw new NotFoundException('active rank entry not found');
    }

    const updated = await this.prisma.rankEntry.update({
      where: { id: entry.id },
      data: { status: RankEntryStatus.INVALID },
    });

    return {
      invalidated: true,
      entry: {
        ...updated,
        score: Number(updated.score),
      },
    };
  }

  async transferEntry(slotId: string, payload: { entryId: string; toUserId: string }) {
    if (this.useDemoMode) {
      return this.demoStoreService.transferEntry({ slotId, ...payload });
    }

    const entry = await this.prisma.rankEntry.findFirst({
      where: {
        id: payload.entryId,
        roomSlotId: slotId,
        status: RankEntryStatus.ACTIVE,
      },
    });

    if (!entry) {
      throw new NotFoundException('active rank entry not found');
    }

    const targetUser = await this.prisma.user.findUnique({ where: { id: payload.toUserId } });
    if (!targetUser) {
      throw new NotFoundException('target user not found');
    }

    await this.prisma.rankEntry.update({
      where: { id: entry.id },
      data: { status: RankEntryStatus.TRANSFERRED },
    });

    const transferred = await this.prisma.rankEntry.create({
      data: {
        roomSlotId: slotId,
        userId: payload.toUserId,
        sourceType: RankSourceType.TRANSFER,
        sourceContent: `转麦:${entry.sourceContent}`,
        score: entry.score,
        originEntryId: entry.id,
      },
    });

    return {
      transferred: true,
      fromEntryId: entry.id,
      toEntry: {
        ...transferred,
        score: Number(transferred.score),
      },
    };
  }

  async resetSlotRank(slotId: string) {
    if (this.useDemoMode) {
      return this.demoStoreService.resetSlotRank(slotId);
    }

    const result = await this.prisma.rankEntry.updateMany({
      where: {
        roomSlotId: slotId,
        status: RankEntryStatus.ACTIVE,
      },
      data: {
        status: RankEntryStatus.CANCELLED,
      },
    });

    return {
      reset: true,
      affectedCount: result.count,
    };
  }
}
