import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { PlatformAdminGuard } from './platform-admin.guard';
import { TenantAdminGuard } from './tenant-admin.guard';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminRole } from '../../database/entities';
import type { AdminJwtPayload } from '../auth/admin-auth.service';
import type { AdminTenantAccessService } from '../auth/admin-tenant-access.service';

const ADMIN_ID = 'admin-1';
const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

function payload(role: AdminRole): AdminJwtPayload {
  return { sub: ADMIN_ID, email: 'admin@example.com', role, type: 'admin' };
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

const jwtGuardStub = { canActivate: () => true } as unknown as AdminJwtGuard;

const failingJwtGuard = (message: string) =>
  ({
    canActivate: () => {
      throw new UnauthorizedException(message);
    },
  }) as unknown as AdminJwtGuard;

/** 배정된 테넌트 집합을 흉내낸다. */
function accessStub(assigned: string[]) {
  const set = new Set(assigned);
  return {
    isMember: jest.fn((_adminId: string, tenantId: string) => Promise.resolve(set.has(tenantId))),
  } as unknown as AdminTenantAccessService;
}

describe('PlatformAdminGuard', () => {
  it('PLATFORM_ADMIN 은 통과한다', async () => {
    const guard = new PlatformAdminGuard(jwtGuardStub);
    await expect(guard.canActivate(contextWith(payload(AdminRole.PLATFORM_ADMIN)))).resolves.toBe(
      true,
    );
  });

  it('TENANT_ADMIN 은 403(ForbiddenException)으로 거부한다 — 401 은 프런트의 강제 로그아웃을 유발한다', async () => {
    const guard = new PlatformAdminGuard(jwtGuardStub);
    await expect(
      guard.canActivate(contextWith(payload(AdminRole.TENANT_ADMIN))),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('인증 실패는 401 그대로 전파한다', async () => {
    const guard = new PlatformAdminGuard(failingJwtGuard('Invalid or expired admin token'));
    await expect(guard.canActivate(contextWith(undefined))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('TenantAdminGuard', () => {
  it('PLATFORM_ADMIN 은 테넌트와 무관하게 통과하며 배정을 조회하지 않는다', async () => {
    const access = accessStub([]);
    const guard = new TenantAdminGuard(jwtGuardStub, access);

    await expect(
      guard.canActivate(contextWith(payload(AdminRole.PLATFORM_ADMIN), { tenantId: TENANT_A })),
    ).resolves.toBe(true);
    expect(access.isMember).not.toHaveBeenCalled();
  });

  it('TENANT_ADMIN 은 배정된 테넌트에 접근할 수 있다', async () => {
    const guard = new TenantAdminGuard(jwtGuardStub, accessStub([TENANT_A]));
    await expect(
      guard.canActivate(contextWith(payload(AdminRole.TENANT_ADMIN), { tenantId: TENANT_A })),
    ).resolves.toBe(true);
  });

  it('여러 테넌트를 배정받으면 각각에 접근할 수 있다', async () => {
    const guard = new TenantAdminGuard(jwtGuardStub, accessStub([TENANT_A, TENANT_B]));

    await expect(
      guard.canActivate(contextWith(payload(AdminRole.TENANT_ADMIN), { tenantId: TENANT_A })),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextWith(payload(AdminRole.TENANT_ADMIN), { tenantId: TENANT_B })),
    ).resolves.toBe(true);
  });

  it('배정되지 않은 테넌트는 403 으로 거부된다', async () => {
    const guard = new TenantAdminGuard(jwtGuardStub, accessStub([TENANT_A]));
    await expect(
      guard.canActivate(contextWith(payload(AdminRole.TENANT_ADMIN), { tenantId: TENANT_B })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('배정을 해제하면 같은 토큰으로도 즉시 차단된다 — 배정을 JWT 에 담지 않는 이유', async () => {
    const assigned = new Set([TENANT_A]);
    const access = {
      isMember: (_a: string, t: string) => Promise.resolve(assigned.has(t)),
    } as unknown as AdminTenantAccessService;
    const guard = new TenantAdminGuard(jwtGuardStub, access);
    const ctx = () => contextWith(payload(AdminRole.TENANT_ADMIN), { tenantId: TENANT_A });

    await expect(guard.canActivate(ctx())).resolves.toBe(true);

    assigned.delete(TENANT_A); // 플랫폼 관리자가 배정을 회수

    await expect(guard.canActivate(ctx())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('경로에 tenantId 파라미터가 없으면 TENANT_ADMIN 을 거부한다', async () => {
    const guard = new TenantAdminGuard(jwtGuardStub, accessStub([TENANT_A]));
    await expect(
      guard.canActivate(contextWith(payload(AdminRole.TENANT_ADMIN), {})),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('인증 실패는 401 그대로 전파한다', async () => {
    const guard = new TenantAdminGuard(failingJwtGuard('Admin token required'), accessStub([]));
    await expect(guard.canActivate(contextWith(undefined))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
