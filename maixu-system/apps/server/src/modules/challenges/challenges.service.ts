import { Injectable } from '@nestjs/common';

@Injectable()
export class ChallengesService {
  getHealth() {
    return { module: 'challenges', ok: true };
  }
}
