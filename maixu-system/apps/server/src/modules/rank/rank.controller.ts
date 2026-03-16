import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RankCommandService } from './services/rank-command.service';
import { RankQueryService } from './services/rank-query.service';
import { RankPolicyService } from './services/rank-policy.service';

@Controller('rank')
export class RankController {
  constructor(
    private readonly rankQueryService: RankQueryService,
    private readonly rankCommandService: RankCommandService,
    private readonly rankPolicyService: RankPolicyService,
  ) {}

  @Get('policies')
  getPolicies() {
    return this.rankPolicyService.getPolicies();
  }

  @Get('slots/:slotId')
  getSlotRank(@Param('slotId') slotId: string) {
    return this.rankQueryService.getSlotRank(slotId);
  }

  @Post('slots/:slotId/join')
  join(@Param('slotId') slotId: string, @Body() body: { userId: string; sourceContent: string; score: number }) {
    return this.rankCommandService.join(slotId, body);
  }

  @Post('slots/:slotId/cancel')
  cancel(@Param('slotId') slotId: string, @Body() body: { userId?: string; entryId?: string }) {
    return this.rankCommandService.cancel(slotId, body);
  }

  @Post('slots/:slotId/manual-add')
  manualAdd(@Param('slotId') slotId: string, @Body() body: { userId: string; sourceContent: string; score: number }) {
    return this.rankCommandService.manualAdd(slotId, body);
  }
}
