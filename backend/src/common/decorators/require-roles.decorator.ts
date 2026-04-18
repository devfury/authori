import { SetMetadata } from '@nestjs/common';

export const REQUIRED_ROLES_KEY = 'roles';

export const RequireRoles = (...roles: string[]) =>
  SetMetadata(REQUIRED_ROLES_KEY, roles);
