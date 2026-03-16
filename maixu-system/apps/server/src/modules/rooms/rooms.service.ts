import { Injectable } from '@nestjs/common';
import { RankRepository } from '../rank/repositories/rank.repository';
import { SlotsRepository } from '../slots/repositories/slots.repository';
import { RoomsRepository } from './repositories/rooms.repository';

@Injectable()
export class RoomsService {
  constructor(
    private readonly roomsRepository: RoomsRepository,
    private readonly slotsRepository: SlotsRepository,
    private readonly rankRepository: RankRepository,
  ) {}

  getHealth() {
    return { module: 'rooms', ok: true };
  }

  async listRooms() {
    const rooms = await this.roomsRepository.listRooms();

    return Promise.all(
      rooms.map(async (room) => {
        const currentSlot = await this.slotsRepository.getRoomCurrentSlot(room.id);
        const rank = await this.rankRepository.getRank(currentSlot.id);

        return {
          ...room,
          currentSlot,
          currentRankCount: rank.entries.length,
        };
      }),
    );
  }

  async getRoom(roomId: string) {
    const room = await this.roomsRepository.getRoom(roomId);
    const currentSlot = await this.slotsRepository.getRoomCurrentSlot(room.id);
    const rank = await this.rankRepository.getRank(currentSlot.id);

    return {
      ...room,
      currentSlot,
      currentRankCount: rank.entries.length,
      topEntries: rank.topEntries,
    };
  }

  async getCurrentSlot(roomId: string) {
    const room = await this.roomsRepository.getRoom(roomId);
    return this.slotsRepository.getRoomCurrentSlot(room.id);
  }
}
