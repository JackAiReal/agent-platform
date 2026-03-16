import { Injectable } from '@nestjs/common';
import { WsGateway } from '../../../infrastructure/ws/ws.gateway';
import { DemoStoreService } from '../../../common/demo/demo-store.service';
import { RankPolicyService } from './rank-policy.service';

@Injectable()
export class RankCommandService {
  constructor(
    private readonly rankPolicyService: RankPolicyService,
    private readonly demoStoreService: DemoStoreService,
    private readonly wsGateway: WsGateway,
  ) {}

  join(slotId: string, payload: { userId: string; sourceContent: string; score: number }) {
    const decision = this.rankPolicyService.canJoin(slotId, payload.userId, payload.score);
    if (!decision.accepted) {
      return { slotId, accepted: false, reason: decision.reason, payload };
    }

    const result = this.demoStoreService.joinRank({
      slotId,
      userId: payload.userId,
      sourceContent: payload.sourceContent,
      score: payload.score,
      sourceType: 'KEYWORD',
    });

    const slot = this.demoStoreService.getSlot(slotId);
    const rank = this.demoStoreService.getRank(slotId);
    this.wsGateway.emitToRoom(slot.roomId, 'rank.updated', rank);
    this.wsGateway.emitToSlot(slotId, 'rank.updated', rank);

    return {
      slotId,
      ...result,
      currentRank: rank,
    };
  }

  cancel(slotId: string, payload: { userId?: string; entryId?: string }) {
    const result = this.demoStoreService.cancelRank({
      slotId,
      userId: payload.userId,
      entryId: payload.entryId,
    });

    const slot = this.demoStoreService.getSlot(slotId);
    const rank = this.demoStoreService.getRank(slotId);
    this.wsGateway.emitToRoom(slot.roomId, 'rank.updated', rank);
    this.wsGateway.emitToSlot(slotId, 'rank.updated', rank);

    return {
      slotId,
      ...result,
      currentRank: rank,
    };
  }

  manualAdd(slotId: string, payload: { userId: string; sourceContent: string; score: number }) {
    const result = this.demoStoreService.joinRank({
      slotId,
      userId: payload.userId,
      sourceContent: payload.sourceContent,
      score: payload.score,
      sourceType: 'MANUAL',
    });

    const slot = this.demoStoreService.getSlot(slotId);
    const rank = this.demoStoreService.getRank(slotId);
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
