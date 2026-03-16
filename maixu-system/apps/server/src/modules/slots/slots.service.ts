import { Injectable } from '@nestjs/common';
import { DemoStoreService } from '../../common/demo/demo-store.service';

@Injectable()
export class SlotsService {
  constructor(private readonly demoStoreService: DemoStoreService) {}

  getHealth() {
    return { module: 'slots', ok: true };
  }

  getSlot(slotId: string) {
    const slot = this.demoStoreService.getSlot(slotId);
    const room = this.demoStoreService.getRoom(slot.roomId);

    return {
      ...slot,
      room,
    };
  }

  getSlotRank(slotId: string) {
    return this.demoStoreService.getRank(slotId);
  }
}
