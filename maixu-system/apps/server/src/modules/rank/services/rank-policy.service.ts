import { Injectable } from '@nestjs/common';
import { Buy8Policy } from '../policies/buy8.policy';
import { CancelPolicy } from '../policies/cancel.policy';
import { InsertPolicy } from '../policies/insert.policy';
import { TopCardPolicy } from '../policies/top-card.policy';
import { TransferPolicy } from '../policies/transfer.policy';

@Injectable()
export class RankPolicyService {
  constructor(
    private readonly buy8Policy: Buy8Policy,
    private readonly topCardPolicy: TopCardPolicy,
    private readonly insertPolicy: InsertPolicy,
    private readonly cancelPolicy: CancelPolicy,
    private readonly transferPolicy: TransferPolicy,
  ) {}

  canJoin(_slotId: string, _userId: string, _score: number) {
    return { accepted: true, reason: null };
  }

  getPolicies() {
    return {
      buy8: this.buy8Policy.name(),
      topCard: this.topCardPolicy.name(),
      insert: this.insertPolicy.name(),
      cancel: this.cancelPolicy.name(),
      transfer: this.transferPolicy.name(),
    };
  }
}
