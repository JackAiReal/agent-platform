import { Injectable } from '@nestjs/common';

@Injectable()
export class SlotsService {
  getHealth() {
    return { module: 'slots', ok: true };
  }
}
