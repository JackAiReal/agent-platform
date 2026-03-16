import { Injectable, NotFoundException } from '@nestjs/common';
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
    await this.ensureUserExists(userId);

    if (slot.state === 'FINAL_CLOSED' || slot.state === 'SETTLED') {
      return { accepted: false, reason: 'slot is already closed' };
    }

    if (score < 0) {
      return { accepted: false, reason: 'score must be greater than or equal to 0' };
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
}
