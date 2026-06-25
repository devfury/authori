import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

/**
 * tenantContext가 없는 요청을 차단한다.
 * TenantMiddleware 이후에 적용해야 한다.
 */
@Injectable()
export class RequireTenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.tenantContext) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return true;
  }
}
