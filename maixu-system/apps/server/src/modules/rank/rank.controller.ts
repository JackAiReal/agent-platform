import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RankCommandService } from './services/rank-command.service';
import { RankQueryService } from './services/rank-query.service';

@Controller('rank')
export class RankController {
  constructor(
    private readonly rankQueryService: RankQueryService,
    private readonly rankCommandService: RankCommandService,
  ) {}

  @Get('slots/:slotId')
  getSlotRank(@Param('slotId') slotId: string) {
    return this.rankQueryService.getSlotRank(slotId);
  }

  @Post('slots/:slotId/join')
  join(@Param('slotId') slotId: string, @Body() body: { userId: string; sourceContent: string; score: number }) {
    return this.rankCommandService.join(slotId, body);
  }
}
