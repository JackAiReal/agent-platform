import { Injectable, NotFoundException } from '@nestjs/common';
import { BanType, UserStatus } from '@prisma/client';
import { DemoStoreService } from '../../../common/demo/demo-store.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { SlotsRepository } from '../../slots/repositories/slots.repository';
import { Buy8Policy } from '../policies/buy8.policy';
import { CancelPolicy } from '../policies/cancel.policy';
import { InsertPolicy } from '../policies/insert.policy';
import { TopCardPolicy } from '../policies/top-card.policy';
import { TransferPolicy } from '../policies/transfer.policy';

@Injectable()
export class RankPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demoStoreService: DemoStoreService,
    private readonly slotsRepository: SlotsRepository,
    private readonly buy8Policy: Buy8Policy,
    private readonly topCardPolicy: TopCardPolicy,
    private readonly insertPolicy: InsertPolicy,
    private readonly cancelPolicy: CancelPolicy,
    private readonly transferPolicy: TransferPolicy,
  ) {}

  private get useDemoMode() {
    return !process.env.DATABASE_URL;
  }

  async canJoin(slotId: string, userId: string, score: number) {
    const slot = await this.slotsRepository.getSlot(slotId);
    const user = await this.ensureUserExists(userId);

    if (slot.state === 'FINAL_CLOSED' || slot.state === 'SETTLED') {
      return { accepted: false, reason: 'slot is already closed' };
    }

    if (score < 0) {
      return { accepted: false, reason: 'score must be greater than or equal to 0' };
    }

    if (!this.useDemoMode) {
      if (user.status !== UserStatus.ACTIVE) {
        return { accepted: false, reason: `user status is ${user.status.toLowerCase()}` };
      }

      const activeBan = await this.prisma.roomBanPolicy.findFirst({
        where: {
          roomId: slot.roomId,
          userId,
          banType: {
            in: [BanType.QUEUE_BAN, BanType.TEMP_BAN, BanType.COOLDOWN],
          },
          OR: [{ endAt: null }, { endAt: { gt: new Date() } }],
        },
        orderBy: { createdAt: 'desc' },
      });

      if (activeBan) {
        return { accepted: false, reason: `user is blocked by ${activeBan.banType.toLowerCase()}` };
      }

      const roomConfigs = await this.prisma.roomConfig.findMany({
        where: {
          roomId: slot.roomId,
          configKey: {
            in: ['whitelist_user_ids', 'blacklist_user_ids'],
          },
        },
      });

      const configMap = new Map(roomConfigs.map((item) => [item.configKey, item.configValue]));
      const whitelist = this.normalizeUserList(configMap.get('whitelist_user_ids'));
      const blacklist = this.normalizeUserList(configMap.get('blacklist_user_ids'));

      if (blacklist.includes(userId)) {
        return { accepted: false, reason: 'user is in room blacklist' };
      }

      if (whitelist.length > 0 && !whitelist.includes(userId)) {
        return { accepted: false, reason: 'user is not in room whitelist' };
      }
    }

    return { accepted: true, reason: null };
  }

  getPolicies() {
    return {
      buy8: this.buy8Policy.name(),
      topCard: this.topCardPolicy.name(),
      insert: this.insertPolicy.name(),
      cancel: this.cancelPolicy.name(),
      transfer: this.transferPolicy.name(),
    };
  }

  private async ensureUserExists(userId: string) {
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

  private normalizeUserList(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item)).filter(Boolean);
  }
}
