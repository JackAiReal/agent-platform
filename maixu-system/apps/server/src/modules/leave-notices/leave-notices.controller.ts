import { RoleCode } from '@prisma/client';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { SlotRoleGuard } from '../../common/auth/slot-role.guard';
import { SlotRoles } from '../../common/auth/slot-roles.decorator';
import { LeaveNoticesService } from './leave-notices.service';

@Controller('leave-notices')
export class LeaveNoticesController {
  constructor(private readonly leaveNoticesService: LeaveNoticesService) {}

  @Get('health')
  health() {
    return this.leaveNoticesService.getHealth();
  }

  @UseGuards(JwtAuthGuard)
  @Get('slots/:slotId/my')
  getMyNotice(@Param('slotId') slotId: string, @CurrentUser() user: { sub: string }) {
    return this.leaveNoticesService.getMyNotice(slotId, user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('slots/:slotId/report')
  report(
    @Param('slotId') slotId: string,
    @CurrentUser() user: { sub: string },
    @Body() body: { minutes?: number; reason?: string },
  ) {
    return this.leaveNoticesService.report(slotId, user.sub, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('slots/:slotId/return')
  returnFromLeave(@Param('slotId') slotId: string, @CurrentUser() user: { sub: string }) {
    return this.leaveNoticesService.returnFromLeave(slotId, user.sub);
  }

  @UseGuards(JwtAuthGuard, SlotRoleGuard)
  @SlotRoles(RoleCode.HOST, RoleCode.ROOM_ADMIN, RoleCode.SUPER_ADMIN)
  @Get('slots/:slotId')
  getSlotNotices(@Param('slotId') slotId: string) {
    return this.leaveNoticesService.listSlotNotices(slotId);
  }
}
