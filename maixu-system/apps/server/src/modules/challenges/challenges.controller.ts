import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ChallengesService } from './challenges.service';

@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) {}

  @Get('health')
  health() {
    return this.challengesService.getHealth();
  }

  @Post('slots/:slotId/issue')
  issue(@Param('slotId') slotId: string, @Body() body: { userId: string }) {
    return this.challengesService.issue(slotId, body);
  }

  @Post('slots/:slotId/verify')
  verify(
    @Param('slotId') slotId: string,
    @Body() body: { challengeId: string; userId: string; answer: string },
  ) {
    return this.challengesService.verify(slotId, body);
  }
}
