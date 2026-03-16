import { Injectable } from '@nestjs/common';

@Injectable()
export class RankSettleService {
  settle(slotId: string) {
    return { slotId, settled: true, message: 'rank settle placeholder' };
  }
}
