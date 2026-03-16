import { SetMetadata } from '@nestjs/common';
import { RoleCode } from '@prisma/client';

export const SLOT_ROLES_KEY = 'slot_roles';
export const SlotRoles = (...roles: RoleCode[]) => SetMetadata(SLOT_ROLES_KEY, roles);
