import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { PlatformAdminGuard } from './platform-admin.guard';
import { TenantAdminGuard } from './tenant-admin.guard';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminRole } from '../../database/entities';
import type { AdminJwtPayload } from '../auth/admin-auth.service';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

function payload(role: AdminRole, tenantId: string | null): AdminJwtPayload {
  return { sub: 'admin-1', email: 'admin@example.com', role, tenantId, type: 'admin' };
}

/**
 * AdminJwtGuard 가 이미 통과해 request.admin 을 채운 상태를 재현한다.
 * 두 가드는 역할·테넌트 경계만 판정하므로 JWT 검증은 스텁으로 대체한다.
 */
function contextWith(admin: AdminJwtPayload | undefined, params: Record<string, string> = {}) {
  const request = { params, admin } as unknown as Request;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function jwtGuardStub(onActivate?: () => void): AdminJwtGuard {
  return {
    canActivate: () => {
      onActivate?.();
      return true;
    },
  } as unknown as AdminJwtGuard;
}

describe('PlatformAdminGuard', () => {
  it('PLATFORM_ADMIN 은 통과한다', async () => {
    const guard = new PlatformAdminGuard(jwtGuardStub());
    await expect(
      guard.canActivate(contextWith(payload(AdminRole.PLATFORM_ADMIN, null))),
    ).resolves.toBe(true);
  });

  it('TENANT_ADMIN 은 403(ForbiddenException)으로 거부한다 — 401 은 프런트의 강제 로그아웃을 유발한다', async () => {
    const guard = new PlatformAdminGuard(jwtGuardStub());
    await expect(
      guard.canActivate(contextWith(payload(AdminRole.TENANT_ADMIN, TENANT_A))),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('인증 실패는 401 그대로 전파한다', async () => {
    const guard = new PlatformAdminGuard({
      canActivate: () => {
        throw new UnauthorizedException('Invalid or expired admin token');
      },
    } as unknown as AdminJwtGuard);
    await expect(guard.canActivate(contextWith(undefined))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('TenantAdminGuard', () => {
  it('PLATFORM_ADMIN 은 테넌트와 무관하게 통과한다', async () => {
    const guard = new TenantAdminGuard(jwtGuardStub());
    await expect(
      guard.canActivate(
        contextWith(payload(AdminRole.PLATFORM_ADMIN, null), { tenantId: TENANT_A }),
      ),
    ).resolves.toBe(true);
  });

  it('TENANT_ADMIN 은 자기 테넌트에 접근할 수 있다', async () => {
    const guard = new TenantAdminGuard(jwtGuardStub());
    await expect(
      guard.canActivate(
        contextWith(payload(AdminRole.TENANT_ADMIN, TENANT_A), { tenantId: TENANT_A }),
      ),
    ).resolves.toBe(true);
  });

  it('TENANT_ADMIN 은 다른 테넌트에 접근하면 403 으로 거부된다', async () => {
    const guard = new TenantAdminGuard(jwtGuardStub());
    await expect(
      guard.canActivate(
        contextWith(payload(AdminRole.TENANT_ADMIN, TENANT_A), { tenantId: TENANT_B }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('tenantId 클레임이 없는 TENANT_ADMIN 은 403 으로 거부된다', async () => {
    const guard = new TenantAdminGuard(jwtGuardStub());
    await expect(
      guard.canActivate(contextWith(payload(AdminRole.TENANT_ADMIN, null), { tenantId: TENANT_A })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('경로에 tenantId 파라미터가 없으면 TENANT_ADMIN 을 거부한다', async () => {
    const guard = new TenantAdminGuard(jwtGuardStub());
    await expect(
      guard.canActivate(contextWith(payload(AdminRole.TENANT_ADMIN, TENANT_A), {})),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('인증 실패는 401 그대로 전파한다', async () => {
    const guard = new TenantAdminGuard({
      canActivate: () => {
        throw new UnauthorizedException('Admin token required');
      },
    } as unknown as AdminJwtGuard);
    await expect(guard.canActivate(contextWith(undefined))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
