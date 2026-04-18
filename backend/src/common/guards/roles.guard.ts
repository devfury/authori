import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { REQUIRED_ROLES_KEY } from '../decorators/require-roles.decorator';

interface RoleAwareRequest extends Request {
  accessToken?: {
    roles?: string[];
  };
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<RoleAwareRequest>();
    const roles = new Set(request.accessToken?.roles ?? []);
    return required.every((role) => roles.has(role));
  }
}
