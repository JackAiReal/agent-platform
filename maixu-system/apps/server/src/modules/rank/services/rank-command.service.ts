import { Injectable } from '@nestjs/common';
import { SlotState } from '@prisma/client';
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

  async manualAdd(
    slotId: string,
    payload: { userId: string; sourceContent: string; score: number },
    operatorUserId?: string,
  ) {
    const result = await this.rankRepository.joinRank({
      slotId,
      userId: payload.userId,
      sourceContent: payload.sourceContent,
      score: payload.score,
      sourceType: 'MANUAL',
    });

    await this.logHostAction(slotId, operatorUserId, 'rank.manual_add', payload.userId, {
      sourceContent: payload.sourceContent,
      score: payload.score,
    });

    return this.emitRankChanged(slotId, {
      mode: 'manual',
      ...result,
    });
  }

  async invalidateEntry(slotId: string, payload: { entryId: string }, operatorUserId?: string) {
    const result = await this.rankRepository.invalidateEntry(slotId, payload.entryId);

    await this.logHostAction(slotId, operatorUserId, 'rank.invalidate_entry', payload.entryId);

    return this.emitRankChanged(slotId, result);
  }

  async transferEntry(slotId: string, payload: { entryId: string; toUserId: string }, operatorUserId?: string) {
    const result = await this.rankRepository.transferEntry(slotId, payload);

    await this.logHostAction(slotId, operatorUserId, 'rank.transfer_entry', payload.entryId, {
      toUserId: payload.toUserId,
    });

    return this.emitRankChanged(slotId, result);
  }

  async resetSlot(slotId: string, operatorUserId?: string) {
    const result = await this.rankRepository.resetSlotRank(slotId);
    await this.slotsRepository.updateSlotIsFull(slotId, false);
    await this.slotsRepository.updateSlotState(slotId, SlotState.OPEN);

    await this.logHostAction(slotId, operatorUserId, 'rank.reset_slot', slotId);

    return this.emitRankChanged(slotId, result, true);
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
