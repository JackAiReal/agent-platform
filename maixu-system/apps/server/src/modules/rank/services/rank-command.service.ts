import { Injectable } from '@nestjs/common';
import { SlotState } from '@prisma/client';
import { WsGateway } from '../../../infrastructure/ws/ws.gateway';
import { SlotsRepository } from '../../slots/repositories/slots.repository';
import { RankRepository } from '../repositories/rank.repository';
import { RankPolicyService } from './rank-policy.service';

@Injectable()
export class RankCommandService {
  constructor(
    private readonly rankPolicyService: RankPolicyService,
    private readonly rankRepository: RankRepository,
    private readonly slotsRepository: SlotsRepository,
    private readonly wsGateway: WsGateway,
  ) {}

  async join(slotId: string, payload: { userId: string; sourceContent: string; score: number }) {
    const decision = await this.rankPolicyService.canJoin(slotId, payload.userId, payload.score);
    if (!decision.accepted) {
      return { slotId, accepted: false, reason: decision.reason, payload };
    }

    const result = await this.rankRepository.joinRank({
      slotId,
      userId: payload.userId,
      sourceContent: payload.sourceContent,
      score: payload.score,
      sourceType: 'KEYWORD',
    });

    return this.emitRankChanged(slotId, result);
  }

  async cancel(slotId: string, payload: { userId?: string; entryId?: string }) {
    const result = await this.rankRepository.cancelRank({
      slotId,
      userId: payload.userId,
      entryId: payload.entryId,
    });

    return this.emitRankChanged(slotId, result);
  }

  async manualAdd(slotId: string, payload: { userId: string; sourceContent: string; score: number }) {
    const result = await this.rankRepository.joinRank({
      slotId,
      userId: payload.userId,
      sourceContent: payload.sourceContent,
      score: payload.score,
      sourceType: 'MANUAL',
    });

    return this.emitRankChanged(slotId, {
      mode: 'manual',
      ...result,
    });
  }

  async invalidateEntry(slotId: string, payload: { entryId: string }) {
    const result = await this.rankRepository.invalidateEntry(slotId, payload.entryId);
    return this.emitRankChanged(slotId, result);
  }

  async transferEntry(slotId: string, payload: { entryId: string; toUserId: string }) {
    const result = await this.rankRepository.transferEntry(slotId, payload);
    return this.emitRankChanged(slotId, result);
  }

  async resetSlot(slotId: string) {
    const result = await this.rankRepository.resetSlotRank(slotId);
    await this.slotsRepository.updateSlotIsFull(slotId, false);
    await this.slotsRepository.updateSlotState(slotId, SlotState.OPEN);
    return this.emitRankChanged(slotId, result, true);
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
