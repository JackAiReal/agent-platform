import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleCode } from '@prisma/client';
import { RoomAuthorizationService } from './room-authorization.service';
import { SLOT_ROLES_KEY } from './slot-roles.decorator';

@Injectable()
export class SlotRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly roomAuthorizationService: RoomAuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<RoleCode[]>(SLOT_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!roles || roles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const slotId = request.params.slotId as string | undefined;
    const userId = request.user?.sub as string | undefined;

    if (!slotId || !userId) {
      return false;
    }

    await this.roomAuthorizationService.assertSlotRoles(userId, slotId, roles);
    return true;
  }
}
