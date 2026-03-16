import { Module } from '@nestjs/common';
import { RankController } from './rank.controller';
import { RankQueryService } from './services/rank-query.service';
import { RankCommandService } from './services/rank-command.service';
import { RankPolicyService } from './services/rank-policy.service';
import { RankSettleService } from './services/rank-settle.service';
import { Buy8Policy } from './policies/buy8.policy';
import { TopCardPolicy } from './policies/top-card.policy';
import { InsertPolicy } from './policies/insert.policy';
import { CancelPolicy } from './policies/cancel.policy';
import { TransferPolicy } from './policies/transfer.policy';

@Module({
  controllers: [RankController],
  providers: [
    RankQueryService,
    RankCommandService,
    RankPolicyService,
    RankSettleService,
    Buy8Policy,
    TopCardPolicy,
    InsertPolicy,
    CancelPolicy,
    TransferPolicy,
  ],
  exports: [RankQueryService, RankCommandService, RankPolicyService, RankSettleService],
})
export class RankModule {}
