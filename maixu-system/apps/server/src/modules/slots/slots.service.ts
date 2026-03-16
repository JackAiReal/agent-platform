import { Injectable } from '@nestjs/common';
import { RankRepository } from '../rank/repositories/rank.repository';
import { RoomsRepository } from '../rooms/repositories/rooms.repository';
import { SlotsRepository } from './repositories/slots.repository';

@Injectable()
export class SlotsService {
  constructor(
    private readonly slotsRepository: SlotsRepository,
    private readonly roomsRepository: RoomsRepository,
    private readonly rankRepository: RankRepository,
  ) {}

  getHealth() {
    return { module: 'slots', ok: true };
  }

  async getSlot(slotId: string) {
    const slot = await this.slotsRepository.getSlot(slotId);
    const room = await this.roomsRepository.getRoom(slot.roomId);

    return {
      ...slot,
      room,
    };
  }

  async getSlotRank(slotId: string) {
    return this.rankRepository.getRank(slotId);
  }
}
