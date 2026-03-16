import { Injectable, NotFoundException } from '@nestjs/common';
import { SlotState } from '@prisma/client';
import { DemoStoreService } from '../../../common/demo/demo-store.service';
import { buildRuntimeRoomConfig, buildSlotTimes, getCurrentSlotDate } from '../../../common/utils/room-config.util';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

@Injectable()
export class SlotsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demoStoreService: DemoStoreService,
  ) {}

  private get useDemoMode() {
    return !process.env.DATABASE_URL;
  }

  async getRoomCurrentSlot(roomId: string) {
    if (this.useDemoMode) {
      return this.demoStoreService.getRoomCurrentSlot(roomId);
    }

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { configs: true },
    });

    if (!room) {
      throw new NotFoundException('room not found');
    }

    const slotDate = getCurrentSlotDate();
    const slotHour = new Date().getHours();

    const existing = await this.prisma.roomSlot.findUnique({
      where: {
        roomId_slotDate_slotHour: {
          roomId: room.id,
          slotDate,
          slotHour,
        },
      },
    });

    if (existing) {
      return existing;
    }

    const config = buildRuntimeRoomConfig(room.configs);
    const { startAt, speedCloseAt, finalCloseAt } = buildSlotTimes(slotDate, slotHour, config);

    return this.prisma.roomSlot.create({
      data: {
        roomId: room.id,
        slotDate,
        slotHour,
        startAt,
        speedCloseAt,
        finalCloseAt,
        state: SlotState.OPEN,
        isFull: false,
      },
    });
  }

  async getSlot(slotId: string) {
    if (this.useDemoMode) {
      return this.demoStoreService.getSlot(slotId);
    }

    const slot = await this.prisma.roomSlot.findUnique({
      where: { id: slotId },
    });

    if (!slot) {
      throw new NotFoundException('slot not found');
    }

    return slot;
  }

  async updateSlotIsFull(slotId: string, isFull: boolean) {
    if (this.useDemoMode) {
      return this.demoStoreService.getSlot(slotId);
    }

    return this.prisma.roomSlot.update({
      where: { id: slotId },
      data: { isFull },
    });
  }
}
