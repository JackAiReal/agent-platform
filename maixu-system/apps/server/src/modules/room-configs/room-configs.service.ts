import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, RoleCode } from '@prisma/client';
import { DemoStoreService } from '../../common/demo/demo-store.service';
import { RoomAuthorizationService } from '../../common/auth/room-authorization.service';
import { AuditService } from '../audit/audit.service';
import { RoomsRepository } from '../rooms/repositories/rooms.repository';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class RoomConfigsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demoStoreService: DemoStoreService,
    private readonly roomsRepository: RoomsRepository,
    private readonly roomAuthorizationService: RoomAuthorizationService,
    private readonly auditService: AuditService,
  ) {}

  private get useDemoMode() {
    return !process.env.DATABASE_URL;
  }

  getHealth() {
    return { module: 'room-configs', ok: true };
  }

  async getConfigs(roomIdOrCode: string) {
    const room = await this.roomsRepository.getRoom(roomIdOrCode);

    if (this.useDemoMode) {
      return {
        roomId: room.id,
        roomCode: room.code,
        configs: this.demoStoreService.getRoomConfigs(room.id),
      };
    }

    const configs = await this.prisma.roomConfig.findMany({
      where: { roomId: room.id },
      orderBy: { configKey: 'asc' },
    });

    return {
      roomId: room.id,
      roomCode: room.code,
      configs: Object.fromEntries(configs.map((item) => [item.configKey, item.configValue])),
    };
  }

  async updateConfigs(roomIdOrCode: string, userId: string, payload: { configs: Record<string, unknown> }) {
    const room = await this.roomsRepository.getRoom(roomIdOrCode);

    const hasRole = await this.roomAuthorizationService.hasAnyRoomRole(userId, room.id, [
      RoleCode.HOST,
      RoleCode.ROOM_ADMIN,
      RoleCode.SUPER_ADMIN,
    ]);

    if (!hasRole) {
      throw new ForbiddenException('you do not have permission to update room configs');
    }

    const entries = Object.entries(payload.configs || {});

    if (this.useDemoMode) {
      const updated = this.demoStoreService.updateRoomConfigs(room.id, payload.configs || {});

      await this.auditService.log({
        roomId: room.id,
        operatorUserId: userId,
        action: 'room.config.update',
        targetType: 'room',
        targetId: room.id,
        payload: { updatedKeys: entries.map(([key]) => key), configs: payload.configs },
      });

      return {
        roomId: room.id,
        roomCode: room.code,
        configs: updated,
      };
    }

    for (const [configKey, configValue] of entries) {
      await this.prisma.roomConfig.upsert({
        where: {
          roomId_configKey: {
            roomId: room.id,
            configKey,
          },
        },
        update: {
          configValue: configValue as Prisma.InputJsonValue,
          updatedById: userId,
        },
        create: {
          roomId: room.id,
          configKey,
          configValue: configValue as Prisma.InputJsonValue,
          updatedById: userId,
        },
      });
    }

    await this.auditService.log({
      roomId: room.id,
      operatorUserId: userId,
      action: 'room.config.update',
      targetType: 'room',
      targetId: room.id,
      payload: { updatedKeys: entries.map(([key]) => key), configs: payload.configs },
    });

    return this.getConfigs(room.id);
  }
}
