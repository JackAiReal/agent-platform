import { Injectable, NotFoundException } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { randomUUID } from 'crypto';

type DemoUser = {
  id: string;
  nickname: string;
  avatarUrl?: string;
  openid?: string;
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
  sourceType: 'KEYWORD' | 'MANUAL' | 'TRANSFER';
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

@Injectable()
export class DemoStoreService {
  private readonly users: DemoUser[] = [];
  private readonly rooms: DemoRoom[] = [];
  private readonly slots: DemoSlot[] = [];
  private readonly rankEntries: DemoRankEntry[] = [];
  private readonly roomRoles: DemoRoomRole[] = [];

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

  joinRank(payload: { slotId: string; userId: string; sourceContent: string; score: number; sourceType?: 'KEYWORD' | 'MANUAL' }) {
    const slot = this.getSlot(payload.slotId);
    const room = this.getRoom(slot.roomId);
    const user = this.getUserById(payload.userId);

    if (!user) {
      throw new NotFoundException('user not found');
    }

    const existing = this.getActiveRankEntries(slot.id).find((item) => item.userId === payload.userId);
    if (existing) {
      if (payload.score <= existing.score) {
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
      sourceType: payload.sourceType ?? 'KEYWORD',
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

  private findUserRank(slotId: string, userId: string) {
    const ranked = this.getRank(slotId).entries;
    const found = ranked.find((item) => item.userId === userId);
    return found?.rank ?? null;
  }
}
