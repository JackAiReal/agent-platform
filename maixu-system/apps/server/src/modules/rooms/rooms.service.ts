import { Injectable } from '@nestjs/common';
import { DemoStoreService } from '../../common/demo/demo-store.service';

@Injectable()
export class RoomsService {
  constructor(private readonly demoStoreService: DemoStoreService) {}

  getHealth() {
    return { module: 'rooms', ok: true };
  }

  listRooms() {
    return this.demoStoreService.listRooms();
  }

  getRoom(roomId: string) {
    const room = this.demoStoreService.getRoom(roomId);
    const currentSlot = this.demoStoreService.getRoomCurrentSlot(room.id);
    const rank = this.demoStoreService.getRank(currentSlot.id);

    return {
      ...room,
      currentSlot,
      currentRankCount: rank.entries.length,
      topEntries: rank.topEntries,
    };
  }

  getCurrentSlot(roomId: string) {
    const room = this.demoStoreService.getRoom(roomId);
    return this.demoStoreService.getRoomCurrentSlot(room.id);
  }
}
