import { Injectable } from '@nestjs/common';
import { RankPolicyService } from './rank-policy.service';

@Injectable()
export class RankCommandService {
  constructor(private readonly rankPolicyService: RankPolicyService) {}

  join(slotId: string, payload: { userId: string; sourceContent: string; score: number }) {
    const decision = this.rankPolicyService.canJoin(slotId, payload.userId, payload.score);
    return { slotId, accepted: decision.accepted, reason: decision.reason, payload };
  }
}
