import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DemoStoreService } from '../../common/demo/demo-store.service';
import { RoomAuthorizationService } from '../../common/auth/room-authorization.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RoomsRepository } from '../rooms/repositories/rooms.repository';

type DemoSchedule = {
  id: string;
  roomId: string;
  weekday: number;
  startHour: number;
  endHour: number;
  hostUserId: string;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type DemoOverride = {
  id: string;
  roomId: string;
  slotDate: string;
  slotHour: number;
  hostUserId: string;
  oneTimeOnly: boolean;
  remark?: string;
  createdById?: string;
  createdAt: string;
};

@Injectable()
export class HostSchedulesService {
  private readonly demoSchedules: DemoSchedule[] = [];
  private readonly demoOverrides: DemoOverride[] = [];

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
    return { module: 'host-schedules', ok: true };
  }

  async listSchedules(roomIdOrCode: string) {
    const room = await this.roomsRepository.getRoom(roomIdOrCode);

    if (this.useDemoMode) {
      return this.demoSchedules.filter((item) => item.roomId === room.id);
    }

    return this.prisma.roomHostSchedule.findMany({
      where: { roomId: room.id },
      include: {
        hostUser: {
          select: {
            id: true,
            nickname: true,
            avatarUrl: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ weekday: 'asc' }, { startHour: 'asc' }, { priority: 'desc' }],
    });
  }

  async listOverrides(roomIdOrCode: string) {
    const room = await this.roomsRepository.getRoom(roomIdOrCode);

    if (this.useDemoMode) {
      return this.demoOverrides.filter((item) => item.roomId === room.id);
    }

    return this.prisma.roomHostOverride.findMany({
      where: { roomId: room.id },
      include: {
        hostUser: {
          select: {
            id: true,
            nickname: true,
            avatarUrl: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ slotDate: 'desc' }, { slotHour: 'desc' }],
    });
  }

  async createSchedule(
    roomIdOrCode: string,
    operatorUserId: string,
    payload: { weekday: number; startHour: number; endHour: number; hostUserId: string; priority?: number; isActive?: boolean },
  ) {
    const room = await this.roomsRepository.getRoom(roomIdOrCode);
    await this.assertManagePermission(operatorUserId, room.id);

    if (this.useDemoMode) {
      const now = new Date().toISOString();
      const item: DemoSchedule = {
        id: randomUUID(),
        roomId: room.id,
        weekday: payload.weekday,
        startHour: payload.startHour,
        endHour: payload.endHour,
        hostUserId: payload.hostUserId,
        priority: payload.priority ?? 0,
        isActive: payload.isActive ?? true,
        createdAt: now,
        updatedAt: now,
      };
      this.demoSchedules.push(item);

      await this.auditService.log({
        roomId: room.id,
        operatorUserId,
        action: 'host.schedule.create',
        targetType: 'schedule',
        targetId: item.id,
        payload,
      });

      return item;
    }

    const item = await this.prisma.roomHostSchedule.create({
      data: {
        roomId: room.id,
        weekday: payload.weekday,
        startHour: payload.startHour,
        endHour: payload.endHour,
        hostUserId: payload.hostUserId,
        priority: payload.priority ?? 0,
        isActive: payload.isActive ?? true,
      },
    });

    await this.auditService.log({
      roomId: room.id,
      operatorUserId,
      action: 'host.schedule.create',
      targetType: 'schedule',
      targetId: item.id,
      payload,
    });

    return item;
  }

  async deleteSchedule(scheduleId: string, operatorUserId: string) {
    if (this.useDemoMode) {
      const index = this.demoSchedules.findIndex((item) => item.id === scheduleId);
      if (index < 0) {
        throw new NotFoundException('schedule not found');
      }

      const schedule = this.demoSchedules[index];
      await this.assertManagePermission(operatorUserId, schedule.roomId);
      this.demoSchedules.splice(index, 1);

      await this.auditService.log({
        roomId: schedule.roomId,
        operatorUserId,
        action: 'host.schedule.delete',
        targetType: 'schedule',
        targetId: scheduleId,
      });

      return { deleted: true, scheduleId };
    }

    const schedule = await this.prisma.roomHostSchedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) {
      throw new NotFoundException('schedule not found');
    }

    await this.assertManagePermission(operatorUserId, schedule.roomId);

    await this.prisma.roomHostSchedule.delete({ where: { id: scheduleId } });

    await this.auditService.log({
      roomId: schedule.roomId,
      operatorUserId,
      action: 'host.schedule.delete',
      targetType: 'schedule',
      targetId: scheduleId,
    });

    return { deleted: true, scheduleId };
  }

  async createOverride(
    roomIdOrCode: string,
    operatorUserId: string,
    payload: { slotDate: string; slotHour: number; hostUserId: string; oneTimeOnly?: boolean; remark?: string },
  ) {
    const room = await this.roomsRepository.getRoom(roomIdOrCode);
    await this.assertManagePermission(operatorUserId, room.id);

    if (this.useDemoMode) {
      const item: DemoOverride = {
        id: randomUUID(),
        roomId: room.id,
        slotDate: payload.slotDate,
        slotHour: payload.slotHour,
        hostUserId: payload.hostUserId,
        oneTimeOnly: payload.oneTimeOnly ?? true,
        remark: payload.remark,
        createdById: operatorUserId,
        createdAt: new Date().toISOString(),
      };

      const existingIndex = this.demoOverrides.findIndex(
        (it) => it.roomId === item.roomId && it.slotDate === item.slotDate && it.slotHour === item.slotHour,
      );
      if (existingIndex >= 0) {
        this.demoOverrides.splice(existingIndex, 1, item);
      } else {
        this.demoOverrides.push(item);
      }

      await this.auditService.log({
        roomId: room.id,
        operatorUserId,
        action: 'host.override.upsert',
        targetType: 'override',
        targetId: item.id,
        payload,
      });

      return item;
    }

    const slotDate = new Date(payload.slotDate);
    slotDate.setHours(0, 0, 0, 0);

    const item = await this.prisma.roomHostOverride.upsert({
      where: {
        roomId_slotDate_slotHour: {
          roomId: room.id,
          slotDate,
          slotHour: payload.slotHour,
        },
      },
      update: {
        hostUserId: payload.hostUserId,
        oneTimeOnly: payload.oneTimeOnly ?? true,
        remark: payload.remark,
      },
      create: {
        roomId: room.id,
        slotDate,
        slotHour: payload.slotHour,
        hostUserId: payload.hostUserId,
        oneTimeOnly: payload.oneTimeOnly ?? true,
        remark: payload.remark,
        createdById: operatorUserId,
      },
    });

    await this.auditService.log({
      roomId: room.id,
      operatorUserId,
      action: 'host.override.upsert',
      targetType: 'override',
      targetId: item.id,
      payload,
    });

    return item;
  }

  async deleteOverride(overrideId: string, operatorUserId: string) {
    if (this.useDemoMode) {
      const index = this.demoOverrides.findIndex((item) => item.id === overrideId);
      if (index < 0) {
        throw new NotFoundException('override not found');
      }

      const override = this.demoOverrides[index];
      await this.assertManagePermission(operatorUserId, override.roomId);
      this.demoOverrides.splice(index, 1);

      await this.auditService.log({
        roomId: override.roomId,
        operatorUserId,
        action: 'host.override.delete',
        targetType: 'override',
        targetId: overrideId,
      });

      return { deleted: true, overrideId };
    }

    const override = await this.prisma.roomHostOverride.findUnique({ where: { id: overrideId } });
    if (!override) {
      throw new NotFoundException('override not found');
    }

    await this.assertManagePermission(operatorUserId, override.roomId);

    await this.prisma.roomHostOverride.delete({ where: { id: overrideId } });

    await this.auditService.log({
      roomId: override.roomId,
      operatorUserId,
      action: 'host.override.delete',
      targetType: 'override',
      targetId: overrideId,
    });

    return { deleted: true, overrideId };
  }

  async resolveHost(roomIdOrCode: string, payload?: { slotDate?: string; slotHour?: number }) {
    const room = await this.roomsRepository.getRoom(roomIdOrCode);

    const slotDate = payload?.slotDate ? new Date(payload.slotDate) : new Date();
    slotDate.setHours(0, 0, 0, 0);
    const slotHour = Number.isFinite(Number(payload?.slotHour)) ? Number(payload?.slotHour) : new Date().getHours();

    if (this.useDemoMode) {
      const override = this.demoOverrides.find(
        (item) => item.roomId === room.id && item.slotDate === slotDate.toISOString().slice(0, 10) && item.slotHour === slotHour,
      );
      if (override) {
        return {
          roomId: room.id,
          slotDate: slotDate.toISOString().slice(0, 10),
          slotHour,
          source: 'override',
          hostUserId: override.hostUserId,
          hostUser: this.demoStoreService.getUserById(override.hostUserId),
        };
      }

      const user = this.demoStoreService.listRoomUsers(room.id)[0] ?? null;
      return {
        roomId: room.id,
        slotDate: slotDate.toISOString().slice(0, 10),
        slotHour,
        source: 'fallback',
        hostUserId: user?.id ?? null,
        hostUser: user,
      };
    }

    const override = await this.prisma.roomHostOverride.findFirst({
      where: {
        roomId: room.id,
        slotDate,
        slotHour,
      },
      include: {
        hostUser: {
          select: {
            id: true,
            nickname: true,
            avatarUrl: true,
            createdAt: true,
          },
        },
      },
    });

    if (override) {
      return {
        roomId: room.id,
        slotDate,
        slotHour,
        source: 'override',
        hostUserId: override.hostUserId,
        hostUser: override.hostUser,
        overrideId: override.id,
      };
    }

    const weekday = slotDate.getDay();

    const schedule = await this.prisma.roomHostSchedule.findFirst({
      where: {
        roomId: room.id,
        weekday,
        isActive: true,
        startHour: {
          lte: slotHour,
        },
        endHour: {
          gt: slotHour,
        },
      },
      include: {
        hostUser: {
          select: {
            id: true,
            nickname: true,
            avatarUrl: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    return {
      roomId: room.id,
      slotDate,
      slotHour,
      source: schedule ? 'schedule' : 'none',
      hostUserId: schedule?.hostUserId ?? null,
      hostUser: schedule?.hostUser ?? null,
      scheduleId: schedule?.id,
    };
  }

  private async assertManagePermission(userId: string, roomId: string) {
    const hasRole = await this.roomAuthorizationService.hasAnyRoomRole(userId, roomId, [
      RoleCode.HOST,
      RoleCode.ROOM_ADMIN,
      RoleCode.SUPER_ADMIN,
    ]);

    if (!hasRole) {
      throw new ForbiddenException('you do not have permission to manage host schedules');
    }
  }
}
