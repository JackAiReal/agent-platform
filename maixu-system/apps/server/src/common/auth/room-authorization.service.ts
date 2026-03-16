import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { DemoStoreService } from '../demo/demo-store.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { SlotsRepository } from '../../modules/slots/repositories/slots.repository';

@Injectable()
export class RoomAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demoStoreService: DemoStoreService,
    private readonly slotsRepository: SlotsRepository,
  ) {}

  private get useDemoMode() {
    return !process.env.DATABASE_URL;
  }

  async assertSlotRoles(userId: string, slotId: string, allowedRoles: RoleCode[]) {
    const slot = await this.slotsRepository.getSlot(slotId);
    const hasRole = await this.hasAnyRoomRole(userId, slot.roomId, allowedRoles);

    if (!hasRole) {
      throw new ForbiddenException('you do not have permission to operate this slot');
    }

    return {
      slot,
      allowedRoles,
    };
  }

  async hasAnyRoomRole(userId: string, roomId: string, allowedRoles: RoleCode[]) {
    if (this.useDemoMode) {
      return this.demoStoreService.userHasAnyRoomRole(userId, roomId, allowedRoles);
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('user not found');
    }

    const count = await this.prisma.userRoomRole.count({
      where: {
        userId,
        roomId,
        roleCode: { in: allowedRoles },
      },
    });

    return count > 0;
  }
}
