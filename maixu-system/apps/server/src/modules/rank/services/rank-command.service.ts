import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PerkType, RankEntryStatus, RankSourceType, SlotState } from '@prisma/client';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { WsGateway } from '../../../infrastructure/ws/ws.gateway';
import { AuditService } from '../../audit/audit.service';
import { ChallengesService } from '../../challenges/challenges.service';
import { SlotsRepository } from '../../slots/repositories/slots.repository';
import { RankRepository } from '../repositories/rank.repository';
import { RankPolicyService } from './rank-policy.service';

@Injectable()
export class RankCommandService {
  constructor(
    private readonly rankPolicyService: RankPolicyService,
    private readonly rankRepository: RankRepository,
    private readonly slotsRepository: SlotsRepository,
    private readonly challengesService: ChallengesService,
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
    private readonly idempotencyService: IdempotencyService,
    private readonly wsGateway: WsGateway,
  ) {}

  private get useDemoMode() {
    return !process.env.DATABASE_URL;
  }

  async join(
    slotId: string,
    payload: { userId: string; sourceContent: string; score: number; challengeTicket?: string },
    idempotencyKey?: string,
  ) {
    return this.idempotencyService.execute(`rank:join:${slotId}:${payload.userId}`, idempotencyKey, async () => {
      const challenge = await this.challengesService.assertJoinAllowed(slotId, payload.userId, payload.challengeTicket);
      if (!challenge.verified) {
        return this.buildRejectedJoinResult(slotId, payload, challenge.reason ?? 'challenge verification failed');
      }

      const decision = await this.rankPolicyService.canJoin(slotId, payload.userId, payload.score);
      if (!decision.accepted) {
        return this.buildRejectedJoinResult(slotId, payload, decision.reason ?? 'join rejected by policy');
      }

      const result = await this.rankRepository.joinRank({
        slotId,
        userId: payload.userId,
        sourceContent: payload.sourceContent,
        score: payload.score,
        sourceType: RankSourceType.KEYWORD,
      });

      return this.emitRankChanged(slotId, result);
    });
  }

  async cancel(slotId: string, payload: { userId?: string; entryId?: string }, idempotencyKey?: string) {
    const scope = `rank:cancel:${slotId}:${payload.entryId || payload.userId || 'unknown'}`;

    return this.idempotencyService.execute(scope, idempotencyKey, async () => {
      const result = await this.rankRepository.cancelRank({
        slotId,
        userId: payload.userId,
        entryId: payload.entryId,
      });

      return this.emitRankChanged(slotId, result);
    });
  }

  async manualAdd(
    slotId: string,
    payload: { userId: string; sourceContent: string; score: number },
    operatorUserId?: string,
    idempotencyKey?: string,
  ) {
    return this.idempotencyService.execute(`rank:manual:${slotId}:${payload.userId}`, idempotencyKey, async () => {
      const result = await this.rankRepository.joinRank({
        slotId,
        userId: payload.userId,
        sourceContent: payload.sourceContent,
        score: payload.score,
        sourceType: RankSourceType.MANUAL,
      });

      await this.logHostAction(slotId, operatorUserId, 'rank.manual_add', payload.userId, {
        sourceContent: payload.sourceContent,
        score: payload.score,
      });

      return this.emitRankChanged(slotId, {
        mode: 'manual',
        ...result,
      });
    });
  }

  async useTopCard(slotId: string, payload: { userId: string; sourceContent?: string }, idempotencyKey?: string) {
    return this.idempotencyService.execute(`rank:top-card:${slotId}:${payload.userId}`, idempotencyKey, async () => {
      await this.consumePerk(slotId, payload.userId, PerkType.TOP_CARD);

      const rank = await this.rankRepository.getRank(slotId);
      const topScore = rank.entries[0]?.score ?? 0;
      const score = Number(topScore) + 0.01;

      const result = await this.rankRepository.joinRank({
        slotId,
        userId: payload.userId,
        sourceContent: payload.sourceContent || 'TOP_CARD',
        score,
        sourceType: RankSourceType.TOP_CARD,
        isTop: true,
        allowLowerReplace: true,
      });

      return this.emitRankChanged(slotId, {
        mode: 'top-card',
        ...result,
      });
    });
  }

  async useBuy8(
    slotId: string,
    payload: { userId: string; sourceContent?: string; score?: number },
    idempotencyKey?: string,
  ) {
    return this.idempotencyService.execute(`rank:buy8:${slotId}:${payload.userId}`, idempotencyKey, async () => {
      await this.consumePerk(slotId, payload.userId, PerkType.BUY8_TICKET);

      const score = Number(payload.score ?? 88);
      const result = await this.rankRepository.joinRank({
        slotId,
        userId: payload.userId,
        sourceContent: payload.sourceContent || 'BUY8',
        score,
        sourceType: RankSourceType.BUY8,
        isBuy8: true,
        allowLowerReplace: true,
      });

      return this.emitRankChanged(slotId, {
        mode: 'buy8',
        ...result,
      });
    });
  }

  async useInsert(
    slotId: string,
    payload: { userId: string; targetRank: number; sourceContent?: string },
    idempotencyKey?: string,
  ) {
    return this.idempotencyService.execute(`rank:insert:${slotId}:${payload.userId}`, idempotencyKey, async () => {
      await this.consumePerk(slotId, payload.userId, PerkType.PRIORITY_JOIN);

      const rank = await this.rankRepository.getRank(slotId);
      if (rank.entries.length === 0) {
        throw new BadRequestException('rank is empty, no need to use insert');
      }

      const targetRank = Math.max(1, Math.min(payload.targetRank, rank.entries.length));
      const upper = rank.entries[targetRank - 2];
      const lower = rank.entries[targetRank - 1];

      const upperScore = upper ? Number(upper.score) : Number(lower.score) + 1;
      const lowerScore = Number(lower.score);

      const score = upperScore === lowerScore ? upperScore + 0.01 : (upperScore + lowerScore) / 2;

      const result = await this.rankRepository.joinRank({
        slotId,
        userId: payload.userId,
        sourceContent: payload.sourceContent || `INSERT@${targetRank}`,
        score,
        sourceType: RankSourceType.INSERT,
        isInsert: true,
        allowLowerReplace: true,
      });

      return this.emitRankChanged(slotId, {
        mode: 'insert',
        targetRank,
        ...result,
      });
    });
  }

  async settle(slotId: string, operatorUserId?: string, idempotencyKey?: string) {
    return this.idempotencyService.execute(`rank:settle:${slotId}`, idempotencyKey, async () => {
      if (this.useDemoMode) {
        const resetResult = (await this.resetSlot(slotId, operatorUserId)) as {
          affectedCount?: number;
          currentRank: unknown;
        };
        return {
          slotId,
          settled: true,
          settledCount: resetResult.affectedCount ?? 0,
          currentRank: resetResult.currentRank,
        };
      }

      const result = await this.prisma.rankEntry.updateMany({
        where: {
          roomSlotId: slotId,
          status: RankEntryStatus.ACTIVE,
        },
        data: {
          status: RankEntryStatus.SETTLED,
        },
      });

      await this.slotsRepository.updateSlotState(slotId, SlotState.SETTLED);
      await this.logHostAction(slotId, operatorUserId, 'rank.settle', slotId, {
        settledCount: result.count,
      });

      return this.emitRankChanged(
        slotId,
        {
          settled: true,
          settledCount: result.count,
        },
        true,
      );
    });
  }

  async invalidateEntry(
    slotId: string,
    payload: { entryId: string },
    operatorUserId?: string,
    idempotencyKey?: string,
  ) {
    return this.idempotencyService.execute(`rank:invalidate:${slotId}:${payload.entryId}`, idempotencyKey, async () => {
      const result = await this.rankRepository.invalidateEntry(slotId, payload.entryId);

      await this.logHostAction(slotId, operatorUserId, 'rank.invalidate_entry', payload.entryId);

      return this.emitRankChanged(slotId, result);
    });
  }

  async transferEntry(
    slotId: string,
    payload: { entryId: string; toUserId: string },
    operatorUserId?: string,
    idempotencyKey?: string,
  ) {
    return this.idempotencyService.execute(`rank:transfer:${slotId}:${payload.entryId}`, idempotencyKey, async () => {
      const result = await this.rankRepository.transferEntry(slotId, payload);

      await this.logHostAction(slotId, operatorUserId, 'rank.transfer_entry', payload.entryId, {
        toUserId: payload.toUserId,
      });

      return this.emitRankChanged(slotId, result);
    });
  }

  async resetSlot(slotId: string, operatorUserId?: string, idempotencyKey?: string) {
    return this.idempotencyService.execute(`rank:reset:${slotId}`, idempotencyKey, async () => {
      const result = await this.rankRepository.resetSlotRank(slotId);
      await this.slotsRepository.updateSlotIsFull(slotId, false);
      await this.slotsRepository.updateSlotState(slotId, SlotState.OPEN);

      await this.logHostAction(slotId, operatorUserId, 'rank.reset_slot', slotId);

      return this.emitRankChanged(slotId, result, true);
    });
  }

  private async consumePerk(slotId: string, userId: string, perkType: PerkType, usedQuantity = 1) {
    if (this.useDemoMode) {
      return { remainingQty: 999 };
    }

    const slot = await this.slotsRepository.getSlot(slotId);

    const inventory = await this.prisma.userPerkInventory.findFirst({
      where: {
        userId,
        roomId: slot.roomId,
        perkType,
        OR: [{ expireAt: null }, { expireAt: { gt: new Date() } }],
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!inventory || inventory.quantity < usedQuantity) {
      throw new BadRequestException(`${perkType} is not enough`);
    }

    const updated = await this.prisma.userPerkInventory.update({
      where: { id: inventory.id },
      data: {
        quantity: {
          decrement: usedQuantity,
        },
      },
    });

    await this.prisma.perkUsageLog.create({
      data: {
        roomId: slot.roomId,
        roomSlotId: slotId,
        userId,
        perkType,
        usedQuantity,
        payload: {
          remainingQty: updated.quantity,
        },
      },
    });

    return { remainingQty: updated.quantity };
  }

  private async logHostAction(
    slotId: string,
    operatorUserId: string | undefined,
    action: string,
    targetId?: string,
    payload?: Record<string, unknown>,
  ) {
    const slot = await this.slotsRepository.getSlot(slotId);

    await this.auditService.log({
      roomId: slot.roomId,
      roomSlotId: slotId,
      operatorUserId,
      action,
      targetType: 'rank',
      targetId,
      payload,
    });
  }

  private async buildRejectedJoinResult(
    slotId: string,
    payload: { userId: string; sourceContent: string; score: number; challengeTicket?: string },
    reason: string,
  ) {
    const currentRank = await this.rankRepository.getRank(slotId);

    return {
      slotId,
      accepted: false,
      reason,
      payload,
      currentRank,
    };
  }

  private async emitRankChanged(slotId: string, result: Record<string, unknown>, includeSlot = false) {
    const slot = await this.slotsRepository.getSlot(slotId);
    const rank = await this.rankRepository.getRank(slotId);
    this.wsGateway.emitToRoom(slot.roomId, 'rank.updated', rank);
    this.wsGateway.emitToSlot(slotId, 'rank.updated', rank);

    return {
      slotId,
      ...result,
      ...(includeSlot ? { slot } : {}),
      currentRank: rank,
    };
  }
}
