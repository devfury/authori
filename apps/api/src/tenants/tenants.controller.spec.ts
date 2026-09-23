import { CanActivate, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { PlatformAdminGuard } from '../admin/guards/platform-admin.guard';
import { TenantAdminGuard } from '../admin/guards/tenant-admin.guard';
import { AdminRole, TenantStatus } from '../database/entities';
import type { AdminJwtPayload } from '../admin/auth/admin-auth.service';

const passThroughGuard: CanActivate = { canActivate: () => true };

const TENANT_ID = 'tenant-a';

function reqAs(role: AdminRole, tenantId: string | null): Request {
  const admin: AdminJwtPayload = {
    sub: 'admin-1',
    email: 'admin@example.com',
    role,
    tenantId,
    type: 'admin',
  };
  return { admin, ip: '127.0.0.1', headers: {} } as unknown as Request;
}

const platformAdmin = () => reqAs(AdminRole.PLATFORM_ADMIN, null);
const tenantAdmin = () => reqAs(AdminRole.TENANT_ADMIN, TENANT_ID);

describe('TenantsController', () => {
  let controller: TenantsController;
  let tenantsService: { findOne: jest.Mock; update: jest.Mock };

  const tenant = { id: TENANT_ID, name: 'Acme', slug: 'acme', settings: {} };

  beforeEach(async () => {
    tenantsService = {
      findOne: jest.fn().mockResolvedValue(tenant),
      update: jest.fn().mockResolvedValue(tenant),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantsController],
      providers: [
        { provide: TenantsService, useValue: tenantsService },
        { provide: ConfigService, useValue: { get: () => 'development' } },
      ],
    })
      .overrideGuard(PlatformAdminGuard)
      .useValue(passThroughGuard)
      .overrideGuard(TenantAdminGuard)
      .useValue(passThroughGuard)
      .compile();

    controller = module.get(TenantsController);
  });

  describe('findOne', () => {
    it('mailDevRedirectEditable 플래그를 병합해 반환한다', async () => {
      await expect(controller.findOne(TENANT_ID)).resolves.toMatchObject({
        id: TENANT_ID,
        mailDevRedirectEditable: true,
      });
      expect(tenantsService.findOne).toHaveBeenCalledWith(TENANT_ID);
    });
  });

  describe('update — 플랫폼 관리자', () => {
    it('status 를 변경할 수 있다', async () => {
      await controller.update(TENANT_ID, { status: TenantStatus.ACTIVE }, platformAdmin());
      expect(tenantsService.update).toHaveBeenCalledWith(TENANT_ID, {
        status: TenantStatus.ACTIVE,
      });
    });

    it('issuer 를 변경할 수 있다', async () => {
      await controller.update(TENANT_ID, { issuer: 'https://auth.acme.com' }, platformAdmin());
      expect(tenantsService.update).toHaveBeenCalled();
    });

    it('수정 응답에도 mailDevRedirectEditable 플래그가 유지된다', async () => {
      await expect(
        controller.update(TENANT_ID, { name: 'Acme Corp' }, platformAdmin()),
      ).resolves.toMatchObject({ mailDevRedirectEditable: true });
    });
  });

  describe('update — 테넌트 관리자', () => {
    it('name 과 settings 는 수정할 수 있다', async () => {
      const dto = { name: 'Acme Corp', settings: { allowRegistration: true } };
      await controller.update(TENANT_ID, dto, tenantAdmin());
      expect(tenantsService.update).toHaveBeenCalledWith(TENANT_ID, dto);
    });

    it('status 변경은 403 으로 거부하고 서비스를 호출하지 않는다', async () => {
      await expect(
        controller.update(TENANT_ID, { status: TenantStatus.ACTIVE }, tenantAdmin()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tenantsService.update).not.toHaveBeenCalled();
    });

    it('issuer 변경은 403 으로 거부하고 서비스를 호출하지 않는다', async () => {
      await expect(
        controller.update(TENANT_ID, { issuer: 'https://evil.example.com' }, tenantAdmin()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tenantsService.update).not.toHaveBeenCalled();
    });

    it('허용 필드와 금지 필드를 함께 보내도 전체를 거부한다', async () => {
      await expect(
        controller.update(TENANT_ID, { name: 'Acme', status: TenantStatus.ACTIVE }, tenantAdmin()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tenantsService.update).not.toHaveBeenCalled();
    });

    it('빈 수정 요청은 금지 필드 위반으로 보지 않는다', async () => {
      await controller.update(TENANT_ID, {}, tenantAdmin());
      expect(tenantsService.update).toHaveBeenCalledWith(TENANT_ID, {});
    });
  });
});
