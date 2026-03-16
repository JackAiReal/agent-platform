import { Injectable } from '@nestjs/common';

@Injectable()
export class RankQueryService {
  getSlotRank(slotId: string) {
    return { slotId, entries: [], message: 'rank query placeholder' };
  }
}
