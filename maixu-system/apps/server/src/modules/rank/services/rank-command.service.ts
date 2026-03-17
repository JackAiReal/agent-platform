import { Injectable } from '@nestjs/common';
import { SlotState } from '@prisma/client';
import { WsGateway } from '../../../infrastructure/ws/ws.gateway';
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
    private readonly wsGateway: WsGateway,
  ) {}

  async join(slotId: string, payload: { userId: string; sourceContent: string; score: number; challengeTicket?: string }) {
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
