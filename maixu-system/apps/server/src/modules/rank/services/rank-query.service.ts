import { Injectable } from '@nestjs/common';
import { DemoStoreService } from '../../../common/demo/demo-store.service';

@Injectable()
export class RankQueryService {
  constructor(private readonly demoStoreService: DemoStoreService) {}

  getSlotRank(slotId: string) {
    return this.demoStoreService.getRank(slotId);
  }
}
