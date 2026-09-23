import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AdminAuthService } from './admin-auth.service';
import { AdminTenantAccessService } from './admin-tenant-access.service';
import { AdminRole, AdminStatus, AdminUser, Tenant } from '../../database/entities';
import { CryptoUtil } from '../../common/crypto/crypto.util';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UNKNOWN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('AdminAuthService — 테넌트 배정', () => {
  let service: AdminAuthService;
  let adminRepo: { findOne: jest.Mock; update: jest.Mock; createQueryBuilder: jest.Mock };
  let tenantRepo: { find: jest.Mock };
  let access: {
    replaceAssignments: jest.Mock;
    listTenants: jest.Mock;
    listTenantIds: jest.Mock;
  };
  let manager: { save: jest.Mock; create: jest.Mock };

  beforeEach(async () => {
    manager = {
      create: jest.fn((_entity, data: object) => ({ id: 'new-admin', ...data })),
      save: jest.fn((entity: object) => Promise.resolve(entity)),
    };

    adminRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    // ACTIVE 테넌트로 알려진 것만 돌려준다.
    tenantRepo = {
      find: jest.fn(({ where }: { where: { id: { _value: string[] } } }) => {
        const known = new Set([TENANT_A, TENANT_B]);
        return Promise.resolve(where.id._value.filter((id) => known.has(id)).map((id) => ({ id })));
      }),
    };
    access = {
      replaceAssignments: jest.fn().mockResolvedValue(undefined),
      listTenants: jest.fn().mockResolvedValue([]),
      listTenantIds: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuthService,
        { provide: getRepositoryToken(AdminUser), useValue: adminRepo },
        { provide: getRepositoryToken(Tenant), useValue: tenantRepo },
        { provide: JwtService, useValue: { sign: () => 'token' } },
        { provide: ConfigService, useValue: { get: () => 'secret' } },
        { provide: AdminTenantAccessService, useValue: access },
        {
          provide: DataSource,
          useValue: {
            transaction: (fn: (m: typeof manager) => unknown) => fn(manager),
          },
        },
      ],
    }).compile();

    service = module.get(AdminAuthService);
  });

  const base = { email: 'a@example.com', password: 'password123', name: null };

  describe('createAdmin', () => {
    it('TENANT_ADMIN 에 여러 테넌트를 배정한다', async () => {
      await service.createAdmin({
        ...base,
        role: AdminRole.TENANT_ADMIN,
        tenantIds: [TENANT_A, TENANT_B],
      });

      expect(access.replaceAssignments).toHaveBeenCalledWith(
        'new-admin',
        [TENANT_A, TENANT_B],
        manager,
      );
    });

    it('중복 테넌트는 하나로 정리해 배정한다', async () => {
      await service.createAdmin({
        ...base,
        role: AdminRole.TENANT_ADMIN,
        tenantIds: [TENANT_A, TENANT_A, TENANT_B],
      });

      expect(access.replaceAssignments).toHaveBeenCalledWith(
        'new-admin',
        [TENANT_A, TENANT_B],
        manager,
      );
    });

    it('TENANT_ADMIN 인데 배정이 없으면 거부한다', async () => {
      await expect(
        service.createAdmin({ ...base, role: AdminRole.TENANT_ADMIN, tenantIds: [] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(access.replaceAssignments).not.toHaveBeenCalled();
    });

    it('tenantIds 자체를 생략해도 TENANT_ADMIN 은 거부한다', async () => {
      await expect(
        service.createAdmin({ ...base, role: AdminRole.TENANT_ADMIN }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('존재하지 않거나 비활성인 테넌트는 거부한다', async () => {
      await expect(
        service.createAdmin({
          ...base,
          role: AdminRole.TENANT_ADMIN,
          tenantIds: [TENANT_A, UNKNOWN],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('PLATFORM_ADMIN 에게는 tenantIds 를 보내도 배정하지 않는다', async () => {
      await service.createAdmin({
        ...base,
        role: AdminRole.PLATFORM_ADMIN,
        tenantIds: [TENANT_A],
      });

      expect(access.replaceAssignments).toHaveBeenCalledWith('new-admin', [], manager);
    });
  });

  describe('updateAdmin', () => {
    const existing = {
      id: 'admin-1',
      email: 'a@example.com',
      name: null,
      role: AdminRole.TENANT_ADMIN,
      status: AdminStatus.ACTIVE,
      passwordHash: 'hash',
    };

    beforeEach(() => {
      adminRepo.findOne.mockResolvedValue({ ...existing });
    });

    it('tenantIds 를 보내면 배정을 통째로 교체한다', async () => {
      await service.updateAdmin('admin-1', { tenantIds: [TENANT_B] });
      expect(access.replaceAssignments).toHaveBeenCalledWith('admin-1', [TENANT_B], manager);
    });

    it('tenantIds 를 생략하면 배정을 건드리지 않는다', async () => {
      await service.updateAdmin('admin-1', { name: '홍길동' });
      expect(access.replaceAssignments).not.toHaveBeenCalled();
    });

    it('TENANT_ADMIN 의 배정을 빈 배열로 비우려 하면 거부한다', async () => {
      await expect(service.updateAdmin('admin-1', { tenantIds: [] })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(access.replaceAssignments).not.toHaveBeenCalled();
    });

    it('PLATFORM_ADMIN 으로 올리면 기존 배정을 정리한다', async () => {
      await service.updateAdmin('admin-1', { role: AdminRole.PLATFORM_ADMIN });
      expect(access.replaceAssignments).toHaveBeenCalledWith('admin-1', [], manager);
    });

    it('PLATFORM_ADMIN 을 TENANT_ADMIN 으로 내리는데 배정이 없으면 거부한다', async () => {
      adminRepo.findOne.mockResolvedValue({ ...existing, role: AdminRole.PLATFORM_ADMIN });
      access.listTenantIds.mockResolvedValue([]);

      await expect(
        service.updateAdmin('admin-1', { role: AdminRole.TENANT_ADMIN }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('PLATFORM_ADMIN 을 TENANT_ADMIN 으로 내릴 때 tenantIds 를 함께 주면 통과한다', async () => {
      adminRepo.findOne.mockResolvedValue({ ...existing, role: AdminRole.PLATFORM_ADMIN });

      await service.updateAdmin('admin-1', {
        role: AdminRole.TENANT_ADMIN,
        tenantIds: [TENANT_A],
      });
      expect(access.replaceAssignments).toHaveBeenCalledWith('admin-1', [TENANT_A], manager);
    });
  });

  describe('login', () => {
    it('TENANT_ADMIN 은 배정 테넌트를 함께 내려준다', async () => {
      adminRepo.findOne.mockResolvedValue({
        id: 'admin-1',
        email: 'a@example.com',
        role: AdminRole.TENANT_ADMIN,
        status: AdminStatus.ACTIVE,
        passwordHash: await CryptoUtil.hash('password123'),
      });
      access.listTenants.mockResolvedValue([{ id: TENANT_A, slug: 'acme', name: 'Acme' }]);

      const result = await service.login({ email: 'a@example.com', password: 'password123' });

      expect(result.access_token).toBe('token');
      expect(result.tenants).toEqual([{ id: TENANT_A, slug: 'acme', name: 'Acme' }]);
    });

    it('PLATFORM_ADMIN 은 빈 배열을 받는다 — 역할로 전체 접근이라 목록이 필요 없다', async () => {
      adminRepo.findOne.mockResolvedValue({
        id: 'admin-1',
        email: 'a@example.com',
        role: AdminRole.PLATFORM_ADMIN,
        status: AdminStatus.ACTIVE,
        passwordHash: await CryptoUtil.hash('password123'),
      });

      const result = await service.login({ email: 'a@example.com', password: 'password123' });

      expect(result.tenants).toEqual([]);
      expect(access.listTenants).not.toHaveBeenCalled();
    });
  });
});
