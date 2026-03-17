import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BanType, Prisma, RoleCode, UserStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DemoStoreService } from '../../common/demo/demo-store.service';
import { RoomAuthorizationService } from '../../common/auth/room-authorization.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RoomsRepository } from '../rooms/repositories/rooms.repository';

type DemoBanPolicy = {
  id: string;
  roomId: string;
  userId: string;
  banType: BanType;
  reason?: string;
  startAt: string;
  endAt?: string;
  createdById?: string;
  createdAt: string;
};

@Injectable()
export class UsersService {
  private readonly demoBanPolicies: DemoBanPolicy[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly demoStoreService: DemoStoreService,
    private readonly roomAuthorizationService: RoomAuthorizationService,
    private readonly roomsRepository: RoomsRepository,
    private readonly auditService: AuditService,
  ) {}

  private get useDemoMode() {
    return !process.env.DATABASE_URL;
  }

  getHealth() {
    return { module: 'users', ok: true };
  }

  async search(payload?: { keyword?: string; status?: UserStatus; roomId?: string; limit?: number }) {
    const limit = Math.max(1, Math.min(200, Number(payload?.limit) || 20));
    const keyword = (payload?.keyword || '').trim();

    if (this.useDemoMode) {
      let users = this.demoStoreService.listUsers();

      if (payload?.status) {
        users = users.filter((item) => item.status === payload.status);
      }

      if (keyword) {
        const kw = keyword.toLowerCase();
        users = users.filter((item) => item.nickname.toLowerCase().includes(kw) || item.id.toLowerCase().includes(kw));
      }

      if (payload?.roomId) {
        const room = this.demoStoreService.getRoom(payload.roomId);
        const roomUsers = new Set(this.demoStoreService.listRoomUsers(room.id).map((item) => item.id));
        users = users.filter((item) => roomUsers.has(item.id));
      }

      return users.slice(0, limit);
    }

    return this.prisma.user.findMany({
      where: {
        ...(payload?.status ? { status: payload.status } : {}),
        ...(keyword
          ? {
              OR: [
                { nickname: { contains: keyword, mode: 'insensitive' } },
                ...(keyword.includes('-') ? [{ id: keyword }] : []),
                { openid: { contains: keyword, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(payload?.roomId
          ? {
              roomRoles: {
                some: {
                  roomId: payload.roomId,
                },
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getById(userId: string) {
    if (this.useDemoMode) {
      const user = this.demoStoreService.getUserById(userId);
      if (!user) {
        throw new NotFoundException('user not found');
      }
      return user;
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('user not found');
    }

    return user;
  }

  async updateStatus(operatorUserId: string, userId: string, status: UserStatus, reason?: string) {
    await this.assertSuperAdmin(operatorUserId);

    if (this.useDemoMode) {
      const user = this.demoStoreService.updateUserStatus(userId, status);
      await this.auditService.log({
        operatorUserId,
        action: 'user.status.update',
        targetType: 'user',
        targetId: userId,
        payload: { status, reason },
      });
      return user;
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { status },
    });

    await this.auditService.log({
      operatorUserId,
      action: 'user.status.update',
      targetType: 'user',
      targetId: userId,
      payload: { status, reason },
    });

    return user;
  }

  async getRoomLists(roomIdOrCode: string) {
    const room = await this.roomsRepository.getRoom(roomIdOrCode);

    if (this.useDemoMode) {
      const configs = this.demoStoreService.getRoomConfigs(room.id) as Record<string, unknown>;
      return {
        roomId: room.id,
        whitelistUserIds: this.normalizeUserList(configs.whitelist_user_ids),
        blacklistUserIds: this.normalizeUserList(configs.blacklist_user_ids),
      };
    }

    const configRows = await this.prisma.roomConfig.findMany({
      where: {
        roomId: room.id,
        configKey: {
          in: ['whitelist_user_ids', 'blacklist_user_ids'],
        },
      },
    });

    const configMap = new Map(configRows.map((item) => [item.configKey, item.configValue]));

    return {
      roomId: room.id,
      whitelistUserIds: this.normalizeUserList(configMap.get('whitelist_user_ids')),
      blacklistUserIds: this.normalizeUserList(configMap.get('blacklist_user_ids')),
    };
  }

  async setRoomList(
    operatorUserId: string,
    roomIdOrCode: string,
    listType: 'whitelist' | 'blacklist',
    payload: { userId: string; enabled: boolean },
  ) {
    const room = await this.roomsRepository.getRoom(roomIdOrCode);
    await this.assertRoomManagePermission(operatorUserId, room.id);

    const configKey = listType === 'whitelist' ? 'whitelist_user_ids' : 'blacklist_user_ids';

    if (this.useDemoMode) {
      const current = this.demoStoreService.getRoomConfigs(room.id) as Record<string, unknown>;
      const nextList = this.updateListValues(this.normalizeUserList(current[configKey]), payload.userId, payload.enabled);
      const updated = this.demoStoreService.updateRoomConfigs(room.id, { [configKey]: nextList }) as Record<string, unknown>;

      await this.auditService.log({
        roomId: room.id,
        operatorUserId,
        action: `user.list.${listType}.set`,
        targetType: 'room',
        targetId: room.id,
        payload,
      });

      return {
        roomId: room.id,
        configKey,
        values: this.normalizeUserList(updated[configKey]),
      };
    }

    const row = await this.prisma.roomConfig.findUnique({
      where: {
        roomId_configKey: {
          roomId: room.id,
          configKey,
        },
      },
    });

    const nextValues = this.updateListValues(this.normalizeUserList(row?.configValue), payload.userId, payload.enabled);

    await this.prisma.roomConfig.upsert({
      where: {
        roomId_configKey: {
          roomId: room.id,
          configKey,
        },
      },
      update: {
        configValue: nextValues as Prisma.InputJsonValue,
        updatedById: operatorUserId,
      },
      create: {
        roomId: room.id,
        configKey,
        configValue: nextValues as Prisma.InputJsonValue,
        updatedById: operatorUserId,
      },
    });

    await this.auditService.log({
      roomId: room.id,
      operatorUserId,
      action: `user.list.${listType}.set`,
      targetType: 'room',
      targetId: room.id,
      payload,
    });

    return {
      roomId: room.id,
      configKey,
      values: nextValues,
    };
  }

  async listBanPolicies(roomIdOrCode: string, payload?: { banType?: BanType; activeOnly?: boolean; limit?: number }) {
    const room = await this.roomsRepository.getRoom(roomIdOrCode);
    const limit = Math.max(1, Math.min(200, Number(payload?.limit) || 50));

    if (this.useDemoMode) {
      const now = Date.now();
      return this.demoBanPolicies
        .filter((item) => item.roomId === room.id)
        .filter((item) => (payload?.banType ? item.banType === payload.banType : true))
        .filter((item) => {
          if (!payload?.activeOnly) return true;
          return !item.endAt || new Date(item.endAt).getTime() > now;
        })
        .slice(0, limit);
    }

    return this.prisma.roomBanPolicy.findMany({
      where: {
        roomId: room.id,
        ...(payload?.banType ? { banType: payload.banType } : {}),
        ...(payload?.activeOnly
          ? {
              OR: [{ endAt: null }, { endAt: { gt: new Date() } }],
            }
          : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            avatarUrl: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async createBanPolicy(
    operatorUserId: string,
    roomIdOrCode: string,
    payload: { userId: string; banType: BanType; reason?: string; endAt?: string },
  ) {
    const room = await this.roomsRepository.getRoom(roomIdOrCode);
    await this.assertRoomManagePermission(operatorUserId, room.id);

    if (this.useDemoMode) {
      const item: DemoBanPolicy = {
        id: randomUUID(),
        roomId: room.id,
        userId: payload.userId,
        banType: payload.banType,
        reason: payload.reason,
        startAt: new Date().toISOString(),
        endAt: payload.endAt,
        createdById: operatorUserId,
        createdAt: new Date().toISOString(),
      };
      this.demoBanPolicies.unshift(item);

      await this.auditService.log({
        roomId: room.id,
        operatorUserId,
        action: 'user.ban.create',
        targetType: 'user',
        targetId: payload.userId,
        payload,
      });

      return item;
    }

    const item = await this.prisma.roomBanPolicy.create({
      data: {
        roomId: room.id,
        userId: payload.userId,
        banType: payload.banType,
        reason: payload.reason,
        ...(payload.endAt ? { endAt: new Date(payload.endAt) } : {}),
        createdById: operatorUserId,
      },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            avatarUrl: true,
            createdAt: true,
          },
        },
      },
    });

    await this.auditService.log({
      roomId: room.id,
      operatorUserId,
      action: 'user.ban.create',
      targetType: 'user',
      targetId: payload.userId,
      payload,
    });

    return item;
  }

  async deleteBanPolicy(operatorUserId: string, roomIdOrCode: string, policyId: string) {
    const room = await this.roomsRepository.getRoom(roomIdOrCode);
    await this.assertRoomManagePermission(operatorUserId, room.id);

    if (this.useDemoMode) {
      const index = this.demoBanPolicies.findIndex((item) => item.id === policyId && item.roomId === room.id);
      if (index < 0) {
        throw new NotFoundException('ban policy not found');
      }
      const [item] = this.demoBanPolicies.splice(index, 1);

      await this.auditService.log({
        roomId: room.id,
        operatorUserId,
        action: 'user.ban.delete',
        targetType: 'ban_policy',
        targetId: policyId,
        payload: { userId: item.userId },
      });

      return { deleted: true, policyId };
    }

    const policy = await this.prisma.roomBanPolicy.findUnique({ where: { id: policyId } });
    if (!policy || policy.roomId !== room.id) {
      throw new NotFoundException('ban policy not found');
    }

    await this.prisma.roomBanPolicy.delete({ where: { id: policyId } });

    await this.auditService.log({
      roomId: room.id,
      operatorUserId,
      action: 'user.ban.delete',
      targetType: 'ban_policy',
      targetId: policyId,
      payload: { userId: policy.userId },
    });

    return { deleted: true, policyId };
  }

  private normalizeUserList(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item)).filter(Boolean);
  }

  private updateListValues(values: string[], userId: string, enabled: boolean) {
    const set = new Set(values);
    if (enabled) set.add(userId);
    else set.delete(userId);
    return [...set];
  }

  private async assertRoomManagePermission(userId: string, roomId: string) {
    const hasRole = await this.roomAuthorizationService.hasAnyRoomRole(userId, roomId, [
      RoleCode.HOST,
      RoleCode.ROOM_ADMIN,
      RoleCode.SUPER_ADMIN,
    ]);

    if (!hasRole) {
      throw new ForbiddenException('you do not have permission to manage users in this room');
    }
  }

  private async assertSuperAdmin(userId: string) {
    if (this.useDemoMode) {
      const hasRole = this.demoStoreService.userHasAnyRole(userId, [RoleCode.SUPER_ADMIN]);
      if (!hasRole) {
        throw new ForbiddenException('super admin required');
      }
      return;
    }

    const count = await this.prisma.userRoomRole.count({
      where: {
        userId,
        roleCode: RoleCode.SUPER_ADMIN,
      },
    });

    if (count <= 0) {
      throw new ForbiddenException('super admin required');
    }
  }
}
