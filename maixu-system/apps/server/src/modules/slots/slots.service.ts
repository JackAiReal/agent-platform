import { Injectable } from '@nestjs/common';
import { SlotState } from '@prisma/client';
import { DemoStoreService } from '../../common/demo/demo-store.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { WsGateway } from '../../infrastructure/ws/ws.gateway';
import { AuditService } from '../audit/audit.service';
import { RankRepository } from '../rank/repositories/rank.repository';
import { RoomsRepository } from '../rooms/repositories/rooms.repository';
import { SlotsRepository } from './repositories/slots.repository';

@Injectable()
export class SlotsService {
  constructor(
    private readonly slotsRepository: SlotsRepository,
    private readonly roomsRepository: RoomsRepository,
    private readonly rankRepository: RankRepository,
    private readonly demoStoreService: DemoStoreService,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly wsGateway: WsGateway,
  ) {}

  private get useDemoMode() {
    return !process.env.DATABASE_URL;
  }

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

  async getHostDashboard(slotId: string) {
    const rank = await this.rankRepository.getRank(slotId);

    return {
      slot: rank.slot,
      room: rank.room,
      summary: {
        totalEntries: rank.entries.length,
        topCount: rank.topEntries.length,
        maxRank: rank.maxRank,
        state: rank.slot.state,
        isFull: rank.slot.isFull,
      },
      entries: rank.entries,
      topEntries: rank.topEntries,
    };
  }

  async getSlotUserOptions(slotId: string) {
    const slot = await this.slotsRepository.getSlot(slotId);

    if (this.useDemoMode) {
      return this.demoStoreService.listRoomUsers(slot.roomId);
    }

    const roleUsers = await this.prisma.userRoomRole.findMany({
      where: { roomId: slot.roomId },
      distinct: ['userId'],
      include: { user: true },
      orderBy: {
        user: {
          createdAt: 'asc',
        },
      },
    });

    return roleUsers.map((item) => ({
      id: item.user.id,
      nickname: item.user.nickname,
      avatarUrl: item.user.avatarUrl,
      createdAt: item.user.createdAt,
    }));
  }

  async closeSpeedStage(slotId: string, operatorUserId?: string) {
    const slot = await this.slotsRepository.updateSlotState(slotId, SlotState.FINAL_OPEN);
    await this.logHostAction(slotId, operatorUserId, 'slot.close_speed_stage');
    await this.emitRankUpdated(slotId);
    return {
      slotId,
      action: 'closeSpeedStage',
      slot,
    };
  }

  async closeFinalStage(slotId: string, operatorUserId?: string) {
    const slot = await this.slotsRepository.updateSlotState(slotId, SlotState.FINAL_CLOSED);
    await this.logHostAction(slotId, operatorUserId, 'slot.close_final_stage');
    await this.emitRankUpdated(slotId);
    return {
      slotId,
      action: 'closeFinalStage',
      slot,
    };
  }

  async toggleAddStage(slotId: string, enabled: boolean, operatorUserId?: string) {
    const slot = await this.slotsRepository.updateSlotState(slotId, enabled ? SlotState.FINAL_OPEN : SlotState.FINAL_CLOSED);
    await this.logHostAction(slotId, operatorUserId, 'slot.toggle_add_stage', {
      enabled,
      nextState: slot.state,
    });
    await this.emitRankUpdated(slotId);
    return {
      slotId,
      action: 'toggleAddStage',
      enabled,
      slot,
    };
  }

  private async logHostAction(slotId: string, operatorUserId?: string, action?: string, payload?: Record<string, unknown>) {
    if (!action) return;

    const slot = await this.slotsRepository.getSlot(slotId);
    await this.auditService.log({
      roomId: slot.roomId,
      roomSlotId: slotId,
      operatorUserId,
      action,
      targetType: 'slot',
      targetId: slotId,
      payload,
    });
  }

  private async emitRankUpdated(slotId: string) {
    const slot = await this.slotsRepository.getSlot(slotId);
    const rank = await this.rankRepository.getRank(slotId);
    this.wsGateway.emitToRoom(slot.roomId, 'rank.updated', rank);
    this.wsGateway.emitToSlot(slotId, 'rank.updated', rank);
  }
}
