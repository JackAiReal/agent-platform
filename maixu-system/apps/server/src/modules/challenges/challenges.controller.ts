import { Controller, Get } from '@nestjs/common';
import { ChallengesService } from './challenges.service';

@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) {}

  @Get('health')
  health() {
    return this.challengesService.getHealth();
  }
}
