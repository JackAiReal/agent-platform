import { Injectable, NotFoundException } from '@nestjs/common';
import { DemoStoreService } from '../../../common/demo/demo-store.service';
import { buildRuntimeRoomConfig } from '../../../common/utils/room-config.util';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

@Injectable()
export class RoomsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demoStoreService: DemoStoreService,
  ) {}

  private get useDemoMode() {
    return !process.env.DATABASE_URL;
  }

  async listRooms() {
    if (this.useDemoMode) {
      return this.demoStoreService.listRooms();
    }

    const rooms = await this.prisma.room.findMany({
      where: { isActive: true },
      include: { configs: true },
      orderBy: { createdAt: 'asc' },
    });

    return rooms.map((room) => ({
      id: room.id,
      code: room.code,
      name: room.name,
      description: room.description,
      isActive: room.isActive,
      config: buildRuntimeRoomConfig(room.configs),
    }));
  }

  async getRoom(roomId: string) {
    if (this.useDemoMode) {
      return this.demoStoreService.getRoom(roomId);
    }

    const room = await this.prisma.room.findFirst({
      where: {
        OR: [{ id: roomId }, { code: roomId }],
      },
      include: { configs: true },
    });

    if (!room) {
      throw new NotFoundException('room not found');
    }

    return {
      id: room.id,
      code: room.code,
      name: room.name,
      description: room.description,
      isActive: room.isActive,
      config: buildRuntimeRoomConfig(room.configs),
    };
  }
}
