import { Injectable } from '@nestjs/common';
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

    const slot = await this.slotsRepository.getSlot(slotId);
    const rank = await this.rankRepository.getRank(slotId);
    this.wsGateway.emitToRoom(slot.roomId, 'rank.updated', rank);
    this.wsGateway.emitToSlot(slotId, 'rank.updated', rank);

    return {
      slotId,
      ...result,
      currentRank: rank,
    };
  }

  async cancel(slotId: string, payload: { userId?: string; entryId?: string }) {
    const result = await this.rankRepository.cancelRank({
      slotId,
      userId: payload.userId,
      entryId: payload.entryId,
    });

    const slot = await this.slotsRepository.getSlot(slotId);
    const rank = await this.rankRepository.getRank(slotId);
    this.wsGateway.emitToRoom(slot.roomId, 'rank.updated', rank);
    this.wsGateway.emitToSlot(slotId, 'rank.updated', rank);

    return {
      slotId,
      ...result,
      currentRank: rank,
    };
  }

  async manualAdd(slotId: string, payload: { userId: string; sourceContent: string; score: number }) {
    const result = await this.rankRepository.joinRank({
      slotId,
      userId: payload.userId,
      sourceContent: payload.sourceContent,
      score: payload.score,
      sourceType: 'MANUAL',
    });

    const slot = await this.slotsRepository.getSlot(slotId);
    const rank = await this.rankRepository.getRank(slotId);
    this.wsGateway.emitToRoom(slot.roomId, 'rank.updated', rank);
    this.wsGateway.emitToSlot(slotId, 'rank.updated', rank);

    return {
      slotId,
      mode: 'manual',
      ...result,
      currentRank: rank,
    };
  }
}
