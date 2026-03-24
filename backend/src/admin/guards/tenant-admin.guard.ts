import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminRole } from '../../database/entities';

/**
 * PLATFORM_ADMIN 또는 해당 테넌트의 TENANT_ADMIN만 접근 허용.
 * URL 파라미터 :tenantId 기준으로 tenant 경계를 검사한다.
 */
@Injectable()
export class TenantAdminGuard implements CanActivate {
  constructor(private readonly jwtGuard: AdminJwtGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.jwtGuard.canActivate(context);
    const request = context.switchToHttp().getRequest<Request>();
    const admin = request.admin!;

    if (admin.role === AdminRole.PLATFORM_ADMIN) return true;

    if (admin.role === AdminRole.TENANT_ADMIN) {
      const paramTenantId = request.params['tenantId'];
      if (admin.tenantId && admin.tenantId === paramTenantId) return true;
    }

    throw new UnauthorizedException('Tenant admin access required for this tenant');
  }
}
