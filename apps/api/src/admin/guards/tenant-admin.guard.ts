import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminRole } from '../../database/entities';
import { AdminTenantAccessService } from '../auth/admin-tenant-access.service';

/**
 * PLATFORM_ADMIN 또는 해당 테넌트에 배정된 TENANT_ADMIN만 접근 허용.
 * URL 파라미터 :tenantId 기준으로 tenant 경계를 검사한다.
 *
 * 배정은 JWT 가 아니라 admin_user_tenants 에서 매 요청 확인한다. 토큰에 담으면
 * 배정을 해제해도 만료될 때까지 접근이 유지된다.
 */
@Injectable()
export class TenantAdminGuard implements CanActivate {
  constructor(
    private readonly jwtGuard: AdminJwtGuard,
    private readonly access: AdminTenantAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.jwtGuard.canActivate(context);
    const request = context.switchToHttp().getRequest<Request>();
    const admin = request.admin!;

    if (admin.role === AdminRole.PLATFORM_ADMIN) return true;

    if (admin.role === AdminRole.TENANT_ADMIN) {
      // express 타입상 params 값은 string | string[] 이다. 배열이면 경로 파라미터로
      // 쓸 수 없는 형태이므로 검사 대상에서 제외한다.
      const paramTenantId = request.params['tenantId'];
      if (
        typeof paramTenantId === 'string' &&
        paramTenantId &&
        (await this.access.isMember(admin.sub, paramTenantId))
      ) {
        return true;
      }
    }

    throw new ForbiddenException('Tenant admin access required for this tenant');
  }
}
