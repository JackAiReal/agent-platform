import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ChallengeStatus, ChallengeType } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { DemoStoreService } from '../../common/demo/demo-store.service';
import { buildRuntimeRoomConfig } from '../../common/utils/room-config.util';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { SlotsRepository } from '../slots/repositories/slots.repository';

type JoinTicketPayload = {
  type: 'challenge_join_ticket';
  slotId: string;
  userId: string;
  challengeId: string;
  nonce: string;
};

@Injectable()
export class ChallengesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demoStoreService: DemoStoreService,
    private readonly slotsRepository: SlotsRepository,
    private readonly jwtService: JwtService,
  ) {}

  private get useDemoMode() {
    return !process.env.DATABASE_URL;
  }

  getHealth() {
    return { module: 'challenges', ok: true };
  }

  async issue(slotId: string, payload: { userId: string }) {
    if (this.useDemoMode) {
      return this.issueDemo(slotId, payload.userId);
    }

    const slot = await this.prisma.roomSlot.findUnique({
      where: { id: slotId },
      include: {
        room: {
          include: { configs: true },
        },
      },
    });

    if (!slot) {
      throw new NotFoundException('slot not found');
    }

    await this.ensureUserExists(payload.userId);

    const config = buildRuntimeRoomConfig(slot.room.configs);

    if (!config.enableChallenge) {
      return {
        enabled: false,
        bypass: true,
        reason: 'challenge is disabled in current room',
      };
    }

    const a = this.randomInt(1, 20);
    const b = this.randomInt(1, 20);
    const answer = String(a + b);

    const expiresAt = new Date(Date.now() + config.challengeTtlSeconds * 1000);
    const challenge = await this.prisma.challengeInstance.create({
      data: {
        roomSlotId: slotId,
        challengeType: ChallengeType.TWO_NUM,
        promptText: `${a} + ${b} = ?`,
        answerHash: this.hashAnswer(answer),
        answerPayload: { answer },
        expiresAt,
        status: ChallengeStatus.ACTIVE,
      },
    });

    return {
      enabled: true,
      bypass: false,
      challengeId: challenge.id,
      challengeType: challenge.challengeType,
      promptText: challenge.promptText,
      expiresAt: challenge.expiresAt,
      ttlSeconds: config.challengeTtlSeconds,
      ...(process.env.NODE_ENV !== 'production' ? { expectedAnswer: answer } : {}),
    };
  }

  async verify(slotId: string, payload: { challengeId: string; userId: string; answer: string }) {
    if (this.useDemoMode) {
      return this.verifyDemo(slotId, payload);
    }

    const challenge = await this.prisma.challengeInstance.findFirst({
      where: {
        id: payload.challengeId,
        roomSlotId: slotId,
      },
    });

    if (!challenge) {
      throw new NotFoundException('challenge not found');
    }

    await this.ensureUserExists(payload.userId);

    if (challenge.status !== ChallengeStatus.ACTIVE) {
      return {
        passed: false,
        reason: 'challenge is not active',
        challengeId: challenge.id,
        expiresAt: challenge.expiresAt,
      };
    }

    if (challenge.expiresAt.getTime() <= Date.now()) {
      await this.prisma.challengeInstance.update({
        where: { id: challenge.id },
        data: { status: ChallengeStatus.EXPIRED },
      });

      return {
        passed: false,
        reason: 'challenge has expired',
        challengeId: challenge.id,
        expiresAt: challenge.expiresAt,
      };
    }

    const answer = (payload.answer || '').trim();
    const isPassed = this.hashAnswer(answer) === challenge.answerHash;

    await this.prisma.challengeSubmission.create({
      data: {
        challengeInstanceId: challenge.id,
        userId: payload.userId,
        submitContent: answer,
        isPassed,
      },
    });

    if (!isPassed) {
      return {
        passed: false,
        reason: 'answer is incorrect',
        challengeId: challenge.id,
        expiresAt: challenge.expiresAt,
      };
    }

    await this.prisma.challengeInstance.update({
      where: { id: challenge.id },
      data: { status: ChallengeStatus.CLOSED },
    });

    const ticket = this.issueJoinTicket({
      slotId,
      userId: payload.userId,
      challengeId: challenge.id,
    });

    return {
      passed: true,
      reason: null,
      challengeId: challenge.id,
      ticket,
      expiresAt: challenge.expiresAt,
    };
  }

  async assertJoinAllowed(slotId: string, userId: string, ticket?: string) {
    if (this.useDemoMode) {
      return this.assertJoinAllowedDemo(slotId, userId, ticket);
    }

    const slot = await this.prisma.roomSlot.findUnique({
      where: { id: slotId },
      include: {
        room: {
          include: { configs: true },
        },
      },
    });

    if (!slot) {
      throw new NotFoundException('slot not found');
    }

    const config = buildRuntimeRoomConfig(slot.room.configs);
    if (!config.enableChallenge) {
      return {
        enabled: false,
        required: false,
        verified: true,
      };
    }

    if (!ticket) {
      return {
        enabled: true,
        required: true,
        verified: false,
        reason: 'challenge ticket is required before join',
      };
    }

    const payload = this.parseJoinTicket(ticket);
    if (payload.slotId !== slotId || payload.userId !== userId) {
      return {
        enabled: true,
        required: true,
        verified: false,
        reason: 'challenge ticket does not match slot or user',
      };
    }

    const submission = await this.prisma.challengeSubmission.findFirst({
      where: {
        challengeInstanceId: payload.challengeId,
        userId,
        isPassed: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!submission) {
      return {
        enabled: true,
        required: true,
        verified: false,
        reason: 'challenge verification record not found',
      };
    }

    return {
      enabled: true,
      required: true,
      verified: true,
      challengeId: payload.challengeId,
    };
  }

  private async issueDemo(slotId: string, userId: string) {
    const slot = this.demoStoreService.getSlot(slotId);
    const user = this.demoStoreService.getUserById(userId);
    if (!user) {
      throw new NotFoundException('user not found');
    }

    const room = this.demoStoreService.getRoom(slot.roomId);
    if (!room.config.enableChallenge) {
      return {
        enabled: false,
        bypass: true,
        reason: 'challenge is disabled in current room',
      };
    }

    const a = this.randomInt(1, 20);
    const b = this.randomInt(1, 20);

    return {
      enabled: true,
      bypass: false,
      challengeId: `demo-${randomUUID()}`,
      challengeType: ChallengeType.TWO_NUM,
      promptText: `${a} + ${b} = ?`,
      expectedAnswer: String(a + b),
      expiresAt: new Date(Date.now() + room.config.challengeTtlSeconds * 1000),
      ttlSeconds: room.config.challengeTtlSeconds,
    };
  }

  private async verifyDemo(
    slotId: string,
    payload: { challengeId: string; userId: string; answer: string },
  ) {
    const slot = this.demoStoreService.getSlot(slotId);
    const room = this.demoStoreService.getRoom(slot.roomId);
    const user = this.demoStoreService.getUserById(payload.userId);

    if (!user) {
      throw new NotFoundException('user not found');
    }

    if (!room.config.enableChallenge) {
      return {
        passed: true,
        reason: null,
        challengeId: payload.challengeId,
        ticket: this.issueJoinTicket({ slotId, userId: payload.userId, challengeId: payload.challengeId }),
        expiresAt: new Date(Date.now() + room.config.challengeTtlSeconds * 1000),
      };
    }

    const answer = (payload.answer || '').trim();
    if (!answer) {
      return {
        passed: false,
        reason: 'answer is required',
        challengeId: payload.challengeId,
      };
    }

    return {
      passed: true,
      reason: null,
      challengeId: payload.challengeId,
      ticket: this.issueJoinTicket({ slotId, userId: payload.userId, challengeId: payload.challengeId }),
      expiresAt: new Date(Date.now() + room.config.challengeTtlSeconds * 1000),
    };
  }

  private assertJoinAllowedDemo(slotId: string, userId: string, ticket?: string) {
    const slot = this.demoStoreService.getSlot(slotId);
    const room = this.demoStoreService.getRoom(slot.roomId);

    if (!room.config.enableChallenge) {
      return {
        enabled: false,
        required: false,
        verified: true,
      };
    }

    if (!ticket) {
      return {
        enabled: true,
        required: true,
        verified: false,
        reason: 'challenge ticket is required before join',
      };
    }

    const payload = this.parseJoinTicket(ticket);
    if (payload.slotId !== slotId || payload.userId !== userId) {
      return {
        enabled: true,
        required: true,
        verified: false,
        reason: 'challenge ticket does not match slot or user',
      };
    }

    return {
      enabled: true,
      required: true,
      verified: true,
      challengeId: payload.challengeId,
    };
  }

  private parseJoinTicket(ticket: string): JoinTicketPayload {
    try {
      const decoded = this.jwtService.verify<JoinTicketPayload>(ticket);
      if (decoded?.type !== 'challenge_join_ticket' || !decoded.slotId || !decoded.userId || !decoded.challengeId) {
        throw new Error('invalid ticket payload');
      }
      return decoded;
    } catch {
      throw new UnauthorizedException('invalid or expired challenge ticket');
    }
  }

  private issueJoinTicket(payload: { slotId: string; userId: string; challengeId: string }) {
    return this.jwtService.sign(
      {
        type: 'challenge_join_ticket',
        slotId: payload.slotId,
        userId: payload.userId,
        challengeId: payload.challengeId,
        nonce: randomUUID(),
      } satisfies JoinTicketPayload,
      {
        expiresIn: '10m',
      },
    );
  }

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('user not found');
    }
    return user;
  }

  private hashAnswer(answer: string) {
    return createHash('sha256').update(answer).digest('hex');
  }

  private randomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
