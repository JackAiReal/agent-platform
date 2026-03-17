import { Injectable } from '@nestjs/common';
import { SlotState } from '@prisma/client';
import { WsGateway } from '../../infrastructure/ws/ws.gateway';
import { RankRepository } from '../rank/repositories/rank.repository';
import { RoomsRepository } from '../rooms/repositories/rooms.repository';
import { SlotsRepository } from './repositories/slots.repository';

@Injectable()
export class SlotsService {
  constructor(
    private readonly slotsRepository: SlotsRepository,
    private readonly roomsRepository: RoomsRepository,
    private readonly rankRepository: RankRepository,
    private readonly wsGateway: WsGateway,
  ) {}

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

  async closeSpeedStage(slotId: string) {
    const slot = await this.slotsRepository.updateSlotState(slotId, SlotState.FINAL_OPEN);
    await this.emitRankUpdated(slotId);
    return {
      slotId,
      action: 'closeSpeedStage',
      slot,
    };
  }

  async closeFinalStage(slotId: string) {
    const slot = await this.slotsRepository.updateSlotState(slotId, SlotState.FINAL_CLOSED);
    await this.emitRankUpdated(slotId);
    return {
      slotId,
      action: 'closeFinalStage',
      slot,
    };
  }

  async toggleAddStage(slotId: string, enabled: boolean) {
    const slot = await this.slotsRepository.updateSlotState(slotId, enabled ? SlotState.FINAL_OPEN : SlotState.FINAL_CLOSED);
    await this.emitRankUpdated(slotId);
    return {
      slotId,
      action: 'toggleAddStage',
      enabled,
      slot,
    };
  }

  private async emitRankUpdated(slotId: string) {
    const slot = await this.slotsRepository.getSlot(slotId);
    const rank = await this.rankRepository.getRank(slotId);
    this.wsGateway.emitToRoom(slot.roomId, 'rank.updated', rank);
    this.wsGateway.emitToSlot(slotId, 'rank.updated', rank);
  }
}
