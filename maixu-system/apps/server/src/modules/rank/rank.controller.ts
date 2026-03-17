import { RoleCode } from '@prisma/client';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { SlotRoleGuard } from '../../common/auth/slot-role.guard';
import { SlotRoles } from '../../common/auth/slot-roles.decorator';
import { RankCommandService } from './services/rank-command.service';
import { RankQueryService } from './services/rank-query.service';
import { RankPolicyService } from './services/rank-policy.service';

@Controller('rank')
export class RankController {
  constructor(
    private readonly rankQueryService: RankQueryService,
    private readonly rankCommandService: RankCommandService,
    private readonly rankPolicyService: RankPolicyService,
  ) {}

  @Get('policies')
  getPolicies() {
    return this.rankPolicyService.getPolicies();
  }

  @Get('slots/:slotId')
  getSlotRank(@Param('slotId') slotId: string) {
    return this.rankQueryService.getSlotRank(slotId);
  }

  @Post('slots/:slotId/join')
  join(
    @Param('slotId') slotId: string,
    @Body() body: { userId: string; sourceContent: string; score: number; challengeTicket?: string },
  ) {
    return this.rankCommandService.join(slotId, body);
  }

  @Post('slots/:slotId/cancel')
  cancel(@Param('slotId') slotId: string, @Body() body: { userId?: string; entryId?: string }) {
    return this.rankCommandService.cancel(slotId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('slots/:slotId/use-top-card')
  useTopCard(
    @Param('slotId') slotId: string,
    @CurrentUser() user: { sub: string },
    @Body() body: { sourceContent?: string },
  ) {
    return this.rankCommandService.useTopCard(slotId, {
      userId: user.sub,
      sourceContent: body.sourceContent,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('slots/:slotId/use-buy8')
  useBuy8(
    @Param('slotId') slotId: string,
    @CurrentUser() user: { sub: string },
    @Body() body: { sourceContent?: string; score?: number },
  ) {
    return this.rankCommandService.useBuy8(slotId, {
      userId: user.sub,
      sourceContent: body.sourceContent,
      score: body.score,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('slots/:slotId/use-insert')
  useInsert(
    @Param('slotId') slotId: string,
    @CurrentUser() user: { sub: string },
    @Body() body: { targetRank: number; sourceContent?: string },
  ) {
    return this.rankCommandService.useInsert(slotId, {
      userId: user.sub,
      targetRank: body.targetRank,
      sourceContent: body.sourceContent,
    });
  }

  @UseGuards(JwtAuthGuard, SlotRoleGuard)
  @SlotRoles(RoleCode.HOST, RoleCode.ROOM_ADMIN, RoleCode.SUPER_ADMIN)
  @Post('slots/:slotId/settle')
  settle(@Param('slotId') slotId: string, @CurrentUser() user: { sub: string }) {
    return this.rankCommandService.settle(slotId, user.sub);
  }

  @UseGuards(JwtAuthGuard, SlotRoleGuard)
  @SlotRoles(RoleCode.HOST, RoleCode.ROOM_ADMIN, RoleCode.SUPER_ADMIN)
  @Post('slots/:slotId/manual-add')
  manualAdd(
    @Param('slotId') slotId: string,
    @CurrentUser() user: { sub: string },
    @Body() body: { userId: string; sourceContent: string; score: number },
  ) {
    return this.rankCommandService.manualAdd(slotId, body, user.sub);
  }

  @UseGuards(JwtAuthGuard, SlotRoleGuard)
  @SlotRoles(RoleCode.HOST, RoleCode.ROOM_ADMIN, RoleCode.SUPER_ADMIN)
  @Post('slots/:slotId/invalidate-entry')
  invalidateEntry(
    @Param('slotId') slotId: string,
    @CurrentUser() user: { sub: string },
    @Body() body: { entryId: string },
  ) {
    return this.rankCommandService.invalidateEntry(slotId, body, user.sub);
  }

  @UseGuards(JwtAuthGuard, SlotRoleGuard)
  @SlotRoles(RoleCode.HOST, RoleCode.ROOM_ADMIN, RoleCode.SUPER_ADMIN)
  @Post('slots/:slotId/transfer-entry')
  transferEntry(
    @Param('slotId') slotId: string,
    @CurrentUser() user: { sub: string },
    @Body() body: { entryId: string; toUserId: string },
  ) {
    return this.rankCommandService.transferEntry(slotId, body, user.sub);
  }

  @UseGuards(JwtAuthGuard, SlotRoleGuard)
  @SlotRoles(RoleCode.HOST, RoleCode.ROOM_ADMIN, RoleCode.SUPER_ADMIN)
  @Post('slots/:slotId/reset-slot')
  resetSlot(@Param('slotId') slotId: string, @CurrentUser() user: { sub: string }) {
    return this.rankCommandService.resetSlot(slotId, user.sub);
  }
}
