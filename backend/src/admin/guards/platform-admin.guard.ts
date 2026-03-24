import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminRole } from '../../database/entities';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly jwtGuard: AdminJwtGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.jwtGuard.canActivate(context);
    const request = context.switchToHttp().getRequest<Request>();
    if (request.admin?.role !== AdminRole.PLATFORM_ADMIN) {
      throw new UnauthorizedException('Platform admin access required');
    }
    return true;
  }
}
