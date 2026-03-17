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

    const config = buildRuntimeRoomConfig(room.configs);
    const { startAt, speedCloseAt, finalCloseAt } = buildSlotTimes(slotDate, slotHour, config);
    const hostUserId = await this.resolveHostUserId(room.id, slotDate, slotHour);

    return this.prisma.roomSlot.upsert({
      where: {
        roomId_slotDate_slotHour: {
          roomId: room.id,
          slotDate,
          slotHour,
        },
      },
      update: {
        ...(hostUserId ? { hostUserId } : {}),
      },
      create: {
        roomId: room.id,
        slotDate,
        slotHour,
        startAt,
        speedCloseAt,
        finalCloseAt,
        state: SlotState.OPEN,
        isFull: false,
        ...(hostUserId ? { hostUserId } : {}),
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
      return this.demoStoreService.updateSlotIsFull(slotId, isFull);
    }

    return this.prisma.roomSlot.update({
      where: { id: slotId },
      data: { isFull },
    });
  }

  async updateSlotState(slotId: string, state: SlotState) {
    if (this.useDemoMode) {
      return this.demoStoreService.updateSlotState(slotId, state);
    }

    return this.prisma.roomSlot.update({
      where: { id: slotId },
      data: { state },
    });
  }

  private async resolveHostUserId(roomId: string, slotDate: Date, slotHour: number) {
    const override = await this.prisma.roomHostOverride.findFirst({
      where: {
        roomId,
        slotDate,
        slotHour,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (override) {
      return override.hostUserId;
    }

    const weekday = slotDate.getDay();

    const schedule = await this.prisma.roomHostSchedule.findFirst({
      where: {
        roomId,
        weekday,
        isActive: true,
        startHour: {
          lte: slotHour,
        },
        endHour: {
          gt: slotHour,
        },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    return schedule?.hostUserId;
  }
}
