import { Injectable, NotFoundException } from '@nestjs/common';
import { RoleCode, UserStatus } from '@prisma/client';
import { randomUUID } from 'crypto';

type DemoUser = {
  id: string;
  nickname: string;
  avatarUrl?: string;
  openid?: string;
  status: UserStatus;
  createdAt: string;
};

type DemoRoom = {
  id: string;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  config: {
    maxRank: number;
    orderStartMinute: number;
    orderStopMinute: number;
    enableChallenge: boolean;
    challengeTtlSeconds: number;
  };
};

type DemoSlotState = 'PENDING' | 'OPENING' | 'OPEN' | 'SPEED_CLOSED' | 'FINAL_OPEN' | 'FINAL_CLOSED' | 'SETTLED' | 'CANCELLED';

type DemoSlot = {
  id: string;
  roomId: string;
  slotDate: string;
  slotHour: number;
  startAt: string;
  speedCloseAt: string;
  finalCloseAt: string;
  state: DemoSlotState;
  isFull: boolean;
};

type DemoRankEntryStatus = 'ACTIVE' | 'CANCELLED' | 'REPLACED' | 'INVALID' | 'TRANSFERRED';

type DemoRankEntry = {
  id: string;
  roomSlotId: string;
  userId: string;
  sourceType: 'KEYWORD' | 'MANUAL' | 'TRANSFER' | 'TOP_CARD' | 'BUY8' | 'INSERT';
  sourceContent: string;
  score: number;
  status: DemoRankEntryStatus;
  originEntryId?: string;
  createdAt: string;
  updatedAt: string;
};

type DemoRoomRole = {
  userId: string;
  roomId: string;
  roleCode: RoleCode;
};

type DemoLeaveNoticeStatus = 'ACTIVE' | 'RETURNED' | 'EXPIRED' | 'CANCELLED';

type DemoLeaveNotice = {
  id: string;
  roomSlotId: string;
  userId: string;
  status: DemoLeaveNoticeStatus;
  startAt: string;
  returnDeadline: string;
  returnedAt?: string;
  remindCount: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class DemoStoreService {
  private readonly users: DemoUser[] = [];
  private readonly rooms: DemoRoom[] = [];
  private readonly slots: DemoSlot[] = [];
  private readonly rankEntries: DemoRankEntry[] = [];
  private readonly roomRoles: DemoRoomRole[] = [];
  private readonly leaveNotices: DemoLeaveNotice[] = [];

  constructor() {
    this.seed();
  }

  private seed() {
    const roomA: DemoRoom = {
      id: randomUUID(),
      code: 'voice-hall-a',
      name: '一号语音厅',
      description: '默认演示房间 A',
      isActive: true,
      config: {
        maxRank: 7,
        orderStartMinute: 0,
        orderStopMinute: 10,
        enableChallenge: true,
        challengeTtlSeconds: 120,
      },
    };

    const roomB: DemoRoom = {
      id: randomUUID(),
      code: 'voice-hall-b',
      name: '二号语音厅',
      description: '默认演示房间 B',
      isActive: true,
      config: {
        maxRank: 8,
        orderStartMinute: 0,
        orderStopMinute: 12,
        enableChallenge: false,
        challengeTtlSeconds: 120,
      },
    };

    this.rooms.push(roomA, roomB);

    const host = this.createOrGetUser({ nickname: '演示主持' });
    const guest = this.createOrGetUser({ nickname: '演示用户' });

    const slotA = this.ensureCurrentSlot(roomA.id);
    const slotB = this.ensureCurrentSlot(roomB.id);

    this.roomRoles.push(
      { userId: host.id, roomId: roomA.id, roleCode: RoleCode.HOST },
      { userId: host.id, roomId: roomA.id, roleCode: RoleCode.ROOM_ADMIN },
      { userId: host.id, roomId: roomB.id, roleCode: RoleCode.HOST },
      { userId: guest.id, roomId: roomA.id, roleCode: RoleCode.USER },
      { userId: guest.id, roomId: roomB.id, roleCode: RoleCode.USER },
    );

    this.rankEntries.push(
      {
        id: randomUUID(),
        roomSlotId: slotA.id,
        userId: host.id,
        sourceType: 'MANUAL',
        sourceContent: '固定档',
        score: 999,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: randomUUID(),
        roomSlotId: slotB.id,
        userId: guest.id,
        sourceType: 'KEYWORD',
        sourceContent: '手速',
        score: 0,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    );
  }

  createOrGetUser(payload: { nickname: string; avatarUrl?: string; openid?: string }) {
    const byOpenid = payload.openid ? this.users.find((item) => item.openid === payload.openid) : undefined;
    if (byOpenid) {
      return byOpenid;
    }

    const existing = this.users.find((item) => item.nickname === payload.nickname);
    if (existing) {
      return existing;
    }

    const user: DemoUser = {
      id: randomUUID(),
      nickname: payload.nickname,
      avatarUrl: payload.avatarUrl,
      openid: payload.openid,
      status: UserStatus.ACTIVE,
      createdAt: new Date().toISOString(),
    };

    this.users.push(user);

    for (const room of this.rooms) {
      this.roomRoles.push({
        userId: user.id,
        roomId: room.id,
        roleCode: RoleCode.USER,
      });
    }

    return user;
  }

  getUserById(userId: string) {
    return this.users.find((item) => item.id === userId) ?? null;
  }

  listRooms() {
    return this.rooms.map((room) => ({
      ...room,
      currentSlot: this.ensureCurrentSlot(room.id),
      currentRankCount: this.getActiveRankEntries(this.ensureCurrentSlot(room.id).id).length,
    }));
  }

  getRoom(roomId: string) {
    const room = this.rooms.find((item) => item.id === roomId || item.code === roomId);
    if (!room) {
      throw new NotFoundException('room not found');
    }
    return room;
  }

  ensureCurrentSlot(roomId: string) {
    const room = this.getRoom(roomId);
    const now = new Date();
    const slotDate = now.toISOString().slice(0, 10);
    const slotHour = now.getHours();

    let slot = this.slots.find(
      (item) => item.roomId === room.id && item.slotDate === slotDate && item.slotHour === slotHour,
    );

    if (!slot) {
      const startAt = new Date(now);
      startAt.setMinutes(room.config.orderStartMinute, 0, 0);

      const speedCloseAt = new Date(now);
      speedCloseAt.setMinutes(room.config.orderStopMinute, 0, 0);

      const finalCloseAt = new Date(speedCloseAt);
      finalCloseAt.setMinutes(finalCloseAt.getMinutes() + 10);

      slot = {
        id: randomUUID(),
        roomId: room.id,
        slotDate,
        slotHour,
        startAt: startAt.toISOString(),
        speedCloseAt: speedCloseAt.toISOString(),
        finalCloseAt: finalCloseAt.toISOString(),
        state: 'OPEN',
        isFull: false,
      };

      this.slots.push(slot);
    }

    return slot;
  }

  getSlot(slotId: string) {
    const slot = this.slots.find((item) => item.id === slotId);
    if (!slot) {
      throw new NotFoundException('slot not found');
    }
    return slot;
  }

  getRoomCurrentSlot(roomId: string) {
    return this.ensureCurrentSlot(roomId);
  }

  updateSlotState(slotId: string, state: DemoSlotState) {
    const slot = this.getSlot(slotId);
    slot.state = state;
    return slot;
  }

  updateSlotIsFull(slotId: string, isFull: boolean) {
    const slot = this.getSlot(slotId);
    slot.isFull = isFull;
    return slot;
  }

  getActiveRankEntries(slotId: string) {
    return this.rankEntries.filter((item) => item.roomSlotId === slotId && item.status === 'ACTIVE');
  }

  getRank(slotId: string) {
    const slot = this.getSlot(slotId);
    const room = this.getRoom(slot.roomId);

    const entries = [...this.getActiveRankEntries(slotId)]
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      })
      .map((entry, index) => ({
        rank: index + 1,
        id: entry.id,
        roomSlotId: entry.roomSlotId,
        userId: entry.userId,
        user: this.getUserById(entry.userId),
        sourceType: entry.sourceType,
        sourceContent: entry.sourceContent,
        score: entry.score,
        status: entry.status,
        inTop: index < room.config.maxRank,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      }));

    return {
      slot,
      room,
      entries,
      topEntries: entries.slice(0, room.config.maxRank),
      maxRank: room.config.maxRank,
    };
  }

  joinRank(payload: {
    slotId: string;
    userId: string;
    sourceContent: string;
    score: number;
    sourceType?: string;
    allowLowerReplace?: boolean;
  }) {
    const slot = this.getSlot(payload.slotId);
    const room = this.getRoom(slot.roomId);
    const user = this.getUserById(payload.userId);

    if (!user) {
      throw new NotFoundException('user not found');
    }

    const existing = this.getActiveRankEntries(slot.id).find((item) => item.userId === payload.userId);
    if (existing) {
      if (payload.score <= existing.score && !payload.allowLowerReplace) {
        return {
          accepted: false,
          reason: 'new score is not higher than current active score',
          entry: existing,
          rank: this.findUserRank(slot.id, payload.userId),
        };
      }

      existing.status = 'REPLACED';
      existing.updatedAt = new Date().toISOString();
    }

    const entry: DemoRankEntry = {
      id: randomUUID(),
      roomSlotId: slot.id,
      userId: payload.userId,
      sourceType: this.normalizeDemoSourceType(payload.sourceType),
      sourceContent: payload.sourceContent,
      score: payload.score,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.rankEntries.push(entry);

    const rank = this.findUserRank(slot.id, payload.userId);
    const topEntries = this.getRank(slot.id).topEntries;
    slot.isFull = topEntries.length >= room.config.maxRank;

    return {
      accepted: true,
      reason: null,
      entry,
      rank,
    };
  }

  cancelRank(payload: { slotId: string; userId?: string; entryId?: string }) {
    const entry = this.rankEntries.find(
      (item) =>
        item.roomSlotId === payload.slotId &&
        item.status === 'ACTIVE' &&
        ((payload.entryId && item.id === payload.entryId) || (payload.userId && item.userId === payload.userId)),
    );

    if (!entry) {
      throw new NotFoundException('active rank entry not found');
    }

    entry.status = 'CANCELLED';
    entry.updatedAt = new Date().toISOString();

    return {
      cancelled: true,
      entry,
    };
  }

  invalidateEntry(payload: { slotId: string; entryId: string }) {
    const entry = this.rankEntries.find(
      (item) => item.roomSlotId === payload.slotId && item.id === payload.entryId && item.status === 'ACTIVE',
    );

    if (!entry) {
      throw new NotFoundException('active rank entry not found');
    }

    entry.status = 'INVALID';
    entry.updatedAt = new Date().toISOString();

    return {
      invalidated: true,
      entry,
    };
  }

  transferEntry(payload: { slotId: string; entryId: string; toUserId: string }) {
    const entry = this.rankEntries.find(
      (item) => item.roomSlotId === payload.slotId && item.id === payload.entryId && item.status === 'ACTIVE',
    );

    if (!entry) {
      throw new NotFoundException('active rank entry not found');
    }

    const targetUser = this.getUserById(payload.toUserId);
    if (!targetUser) {
      throw new NotFoundException('target user not found');
    }

    entry.status = 'TRANSFERRED';
    entry.updatedAt = new Date().toISOString();

    const transferred: DemoRankEntry = {
      id: randomUUID(),
      roomSlotId: payload.slotId,
      userId: payload.toUserId,
      sourceType: 'TRANSFER',
      sourceContent: `转麦:${entry.sourceContent}`,
      score: entry.score,
      originEntryId: entry.id,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.rankEntries.push(transferred);

    return {
      transferred: true,
      fromEntryId: entry.id,
      toEntry: transferred,
    };
  }

  resetSlotRank(slotId: string) {
    let affectedCount = 0;
    for (const entry of this.rankEntries) {
      if (entry.roomSlotId === slotId && entry.status === 'ACTIVE') {
        entry.status = 'CANCELLED';
        entry.updatedAt = new Date().toISOString();
        affectedCount += 1;
      }
    }

    const slot = this.getSlot(slotId);
    slot.isFull = false;

    return {
      reset: true,
      affectedCount,
    };
  }

  userHasAnyRoomRole(userId: string, roomId: string, allowedRoles: RoleCode[]) {
    return this.roomRoles.some(
      (item) => item.userId === userId && item.roomId === roomId && allowedRoles.includes(item.roleCode),
    );
  }

  userHasAnyRole(userId: string, allowedRoles: RoleCode[]) {
    return this.roomRoles.some((item) => item.userId === userId && allowedRoles.includes(item.roleCode));
  }

  listUsers() {
    return [...this.users];
  }

  updateUserStatus(userId: string, status: UserStatus) {
    const user = this.getUserById(userId);
    if (!user) {
      throw new NotFoundException('user not found');
    }
    user.status = status;
    return user;
  }

  listRoomUsers(roomId: string) {
    const userIds = new Set(
      this.roomRoles
        .filter((item) => item.roomId === roomId)
        .map((item) => item.userId),
    );

    return [...userIds]
      .map((userId) => this.getUserById(userId))
      .filter((item): item is DemoUser => Boolean(item))
      .sort((a, b) => a.nickname.localeCompare(b.nickname, 'zh-CN'));
  }

  getRoomConfigs(roomId: string) {
    const room = this.getRoom(roomId);
    return {
      max_rank: room.config.maxRank,
      order_start_minute: room.config.orderStartMinute,
      order_stop_minute: room.config.orderStopMinute,
      enable_challenge: room.config.enableChallenge,
      challenge_ttl_seconds: room.config.challengeTtlSeconds,
    };
  }

  updateRoomConfigs(roomId: string, configs: Record<string, unknown>) {
    const room = this.getRoom(roomId);

    if (configs.max_rank !== undefined) {
      room.config.maxRank = Number(configs.max_rank);
    }

    if (configs.order_start_minute !== undefined) {
      room.config.orderStartMinute = Number(configs.order_start_minute);
    }

    if (configs.order_stop_minute !== undefined) {
      room.config.orderStopMinute = Number(configs.order_stop_minute);
    }

    if (configs.enable_challenge !== undefined) {
      room.config.enableChallenge = Boolean(configs.enable_challenge);
    }

    if (configs.challenge_ttl_seconds !== undefined) {
      room.config.challengeTtlSeconds = Number(configs.challenge_ttl_seconds);
    }

    return this.getRoomConfigs(roomId);
  }

  listLeaveNotices(slotId: string) {
    this.expireLeaveNotices(slotId);

    const notices = this.leaveNotices
      .filter((item) => item.roomSlotId === slotId)
      .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
      .map((item) => ({
        ...item,
        user: this.getUserById(item.userId),
      }));

    return {
      slotId,
      activeNotices: notices.filter((item) => item.status === 'ACTIVE'),
      allNotices: notices.slice(0, 20),
      updatedAt: new Date().toISOString(),
    };
  }

  getMyActiveLeaveNotice(slotId: string, userId: string) {
    this.expireLeaveNotices(slotId);

    const notice = this.leaveNotices
      .filter((item) => item.roomSlotId === slotId && item.userId === userId && item.status === 'ACTIVE')
      .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())[0];

    return notice
      ? {
          ...notice,
          user: this.getUserById(userId),
        }
      : null;
  }

  reportLeaveNotice(payload: { slotId: string; userId: string; returnDeadline: Date; reason?: string }) {
    this.expireLeaveNotices(payload.slotId);

    const existing = this.leaveNotices
      .filter((item) => item.roomSlotId === payload.slotId && item.userId === payload.userId && item.status === 'ACTIVE')
      .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())[0];

    const now = new Date().toISOString();

    if (existing) {
      existing.returnDeadline = payload.returnDeadline.toISOString();
      existing.metadata = {
        ...(existing.metadata || {}),
        ...(payload.reason ? { reason: payload.reason } : {}),
      };
      existing.updatedAt = now;

      return {
        ...existing,
        user: this.getUserById(payload.userId),
      };
    }

    const notice: DemoLeaveNotice = {
      id: randomUUID(),
      roomSlotId: payload.slotId,
      userId: payload.userId,
      status: 'ACTIVE',
      startAt: now,
      returnDeadline: payload.returnDeadline.toISOString(),
      remindCount: 0,
      metadata: payload.reason ? { reason: payload.reason } : undefined,
      createdAt: now,
      updatedAt: now,
    };

    this.leaveNotices.push(notice);

    return {
      ...notice,
      user: this.getUserById(payload.userId),
    };
  }

  returnLeaveNotice(payload: { slotId: string; userId: string }) {
    this.expireLeaveNotices(payload.slotId);

    const existing = this.leaveNotices
      .filter((item) => item.roomSlotId === payload.slotId && item.userId === payload.userId && item.status === 'ACTIVE')
      .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())[0];

    if (!existing) {
      throw new NotFoundException('active leave notice not found');
    }

    existing.status = 'RETURNED';
    existing.returnedAt = new Date().toISOString();
    existing.updatedAt = existing.returnedAt;

    return {
      ...existing,
      user: this.getUserById(payload.userId),
    };
  }

  private expireLeaveNotices(slotId: string) {
    const now = Date.now();

    for (const notice of this.leaveNotices) {
      if (notice.roomSlotId !== slotId) continue;
      if (notice.status !== 'ACTIVE') continue;
      if (new Date(notice.returnDeadline).getTime() <= now) {
        notice.status = 'EXPIRED';
        notice.updatedAt = new Date().toISOString();
      }
    }
  }

  private normalizeDemoSourceType(sourceType?: string): DemoRankEntry['sourceType'] {
    switch (sourceType) {
      case 'MANUAL':
      case 'TRANSFER':
      case 'TOP_CARD':
      case 'BUY8':
      case 'INSERT':
      case 'KEYWORD':
        return sourceType;
      default:
        return 'KEYWORD';
    }
  }

  private findUserRank(slotId: string, userId: string) {
    const ranked = this.getRank(slotId).entries;
    const found = ranked.find((item) => item.userId === userId);
    return found?.rank ?? null;
  }
}
