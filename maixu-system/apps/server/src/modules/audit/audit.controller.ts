import { RoleCode } from '@prisma/client';
import { Controller, ForbiddenException, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RoomAuthorizationService } from '../../common/auth/room-authorization.service';
import { SlotRoleGuard } from '../../common/auth/slot-role.guard';
import { SlotRoles } from '../../common/auth/slot-roles.decorator';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly roomAuthorizationService: RoomAuthorizationService,
  ) {}

  @Get('health')
  health() {
    return this.auditService.getHealth();
  }

  @UseGuards(JwtAuthGuard, SlotRoleGuard)
  @SlotRoles(RoleCode.HOST, RoleCode.ROOM_ADMIN, RoleCode.SUPER_ADMIN)
  @Get('slots/:slotId')
  listBySlot(@Param('slotId') slotId: string, @Query('limit') limit?: string) {
    return this.auditService.listBySlot(slotId, Number(limit) || 50);
  }

  @UseGuards(JwtAuthGuard)
  @Get('rooms/:roomId')
  async listByRoom(
    @Param('roomId') roomId: string,
    @CurrentUser() user: { sub: string },
    @Query('limit') limit?: string,
  ) {
    const hasRole = await this.roomAuthorizationService.hasAnyRoomRole(user.sub, roomId, [
      RoleCode.HOST,
      RoleCode.ROOM_ADMIN,
      RoleCode.SUPER_ADMIN,
    ]);

    if (!hasRole) {
      throw new ForbiddenException('you do not have permission to view room audit logs');
    }

    return this.auditService.listByRoom(roomId, Number(limit) || 50);
  }
}
