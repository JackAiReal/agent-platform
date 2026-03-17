import { RoleCode } from '@prisma/client';
import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { SlotRoleGuard } from '../../common/auth/slot-role.guard';
import { SlotRoles } from '../../common/auth/slot-roles.decorator';
import { SlotsService } from './slots.service';

@Controller('slots')
export class SlotsController {
  constructor(private readonly slotsService: SlotsService) {}

  @Get('health')
  health() {
    return this.slotsService.getHealth();
  }

  @Get(':slotId/rank')
  getSlotRank(@Param('slotId') slotId: string) {
    return this.slotsService.getSlotRank(slotId);
  }

  @UseGuards(JwtAuthGuard, SlotRoleGuard)
  @SlotRoles(RoleCode.HOST, RoleCode.ROOM_ADMIN, RoleCode.SUPER_ADMIN)
  @Get(':slotId/host-dashboard')
  getHostDashboard(@Param('slotId') slotId: string) {
    return this.slotsService.getHostDashboard(slotId);
  }

  @UseGuards(JwtAuthGuard, SlotRoleGuard)
  @SlotRoles(RoleCode.HOST, RoleCode.ROOM_ADMIN, RoleCode.SUPER_ADMIN)
  @Get(':slotId/user-options')
  getSlotUserOptions(@Param('slotId') slotId: string) {
    return this.slotsService.getSlotUserOptions(slotId);
  }

  @Get(':slotId')
  getSlot(@Param('slotId') slotId: string) {
    return this.slotsService.getSlot(slotId);
  }

  @UseGuards(JwtAuthGuard, SlotRoleGuard)
  @SlotRoles(RoleCode.HOST, RoleCode.ROOM_ADMIN, RoleCode.SUPER_ADMIN)
  @Post(':slotId/close-speed-stage')
  closeSpeedStage(
    @Param('slotId') slotId: string,
    @CurrentUser() user: { sub: string },
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    return this.slotsService.closeSpeedStage(slotId, user.sub, idempotencyKey);
  }

  @UseGuards(JwtAuthGuard, SlotRoleGuard)
  @SlotRoles(RoleCode.HOST, RoleCode.ROOM_ADMIN, RoleCode.SUPER_ADMIN)
  @Post(':slotId/close-final-stage')
  closeFinalStage(
    @Param('slotId') slotId: string,
    @CurrentUser() user: { sub: string },
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    return this.slotsService.closeFinalStage(slotId, user.sub, idempotencyKey);
  }

  @UseGuards(JwtAuthGuard, SlotRoleGuard)
  @SlotRoles(RoleCode.HOST, RoleCode.ROOM_ADMIN, RoleCode.SUPER_ADMIN)
  @Post(':slotId/toggle-add-stage')
  toggleAddStage(
    @Param('slotId') slotId: string,
    @CurrentUser() user: { sub: string },
    @Body() body: { enabled: boolean },
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    return this.slotsService.toggleAddStage(slotId, body.enabled, user.sub, idempotencyKey);
  }
}
