import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DemoStoreService } from '../../common/demo/demo-store.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

type AuditLogInput = {
  roomId?: string;
  roomSlotId?: string;
  operatorUserId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  payload?: Record<string, unknown>;
};

@Injectable()
export class AuditService {
  private readonly demoLogs: Array<
    AuditLogInput & {
      id: string;
      createdAt: string;
    }
  > = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly demoStoreService: DemoStoreService,
  ) {}

  private get useDemoMode() {
    return !process.env.DATABASE_URL;
  }

  getHealth() {
    return { module: 'audit', ok: true };
  }

  async log(input: AuditLogInput) {
    if (this.useDemoMode) {
      const item = {
        id: `demo-audit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        ...input,
      };
      this.demoLogs.unshift(item);
      this.demoLogs.splice(200);
      return item;
    }

    return this.prisma.operatorLog.create({
      data: {
        roomId: input.roomId,
        roomSlotId: input.roomSlotId,
        operatorUserId: input.operatorUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        payload: input.payload as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async listBySlot(slotId: string, limit = 50) {
    const take = Math.max(1, Math.min(200, limit));

    if (this.useDemoMode) {
      return this.demoLogs.filter((item) => item.roomSlotId === slotId).slice(0, take);
    }

    return this.prisma.operatorLog.findMany({
      where: { roomSlotId: slotId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async listByRoom(roomId: string, limit = 50) {
    const take = Math.max(1, Math.min(200, limit));

    if (this.useDemoMode) {
      return this.demoLogs.filter((item) => item.roomId === roomId).slice(0, take);
    }

    return this.prisma.operatorLog.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
