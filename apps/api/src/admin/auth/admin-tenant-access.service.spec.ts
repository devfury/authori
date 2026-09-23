import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminTenantAccessService } from './admin-tenant-access.service';
import { AdminUserTenant, Tenant } from '../../database/entities';

const ADMIN_ID = 'admin-1';
const TENANT_A = 'tenant-a';

describe('AdminTenantAccessService', () => {
  let service: AdminTenantAccessService;
  let mappingRepo: { exists: jest.Mock; find: jest.Mock };
  let tenantRepo: { find: jest.Mock };

  beforeEach(async () => {
    mappingRepo = { exists: jest.fn(), find: jest.fn() };
    tenantRepo = { find: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminTenantAccessService,
        { provide: getRepositoryToken(AdminUserTenant), useValue: mappingRepo },
        { provide: getRepositoryToken(Tenant), useValue: tenantRepo },
      ],
    }).compile();

    service = module.get(AdminTenantAccessService);
  });

  describe('isMember', () => {
    it('배정된 테넌트면 true 를 반환한다', async () => {
      mappingRepo.exists.mockResolvedValue(true);
      await expect(service.isMember(ADMIN_ID, TENANT_A)).resolves.toBe(true);
      expect(mappingRepo.exists).toHaveBeenCalledWith({
        where: { adminUserId: ADMIN_ID, tenantId: TENANT_A },
      });
    });

    it('배정되지 않은 테넌트면 false 를 반환한다', async () => {
      mappingRepo.exists.mockResolvedValue(false);
      await expect(service.isMember(ADMIN_ID, TENANT_A)).resolves.toBe(false);
    });

    it('빈 tenantId 는 조회 없이 false 를 반환한다', async () => {
      await expect(service.isMember(ADMIN_ID, '')).resolves.toBe(false);
      expect(mappingRepo.exists).not.toHaveBeenCalled();
    });
  });

  describe('listTenantIds', () => {
    it('배정된 테넌트 ID 목록을 반환한다', async () => {
      mappingRepo.find.mockResolvedValue([{ tenantId: 'a' }, { tenantId: 'b' }]);
      await expect(service.listTenantIds(ADMIN_ID)).resolves.toEqual(['a', 'b']);
    });

    it('배정이 없으면 빈 배열을 반환한다', async () => {
      mappingRepo.find.mockResolvedValue([]);
      await expect(service.listTenantIds(ADMIN_ID)).resolves.toEqual([]);
    });
  });

  describe('listTenants', () => {
    it('id·slug·name 만 담아 반환한다', async () => {
      mappingRepo.find.mockResolvedValue([{ tenantId: 'a' }]);
      tenantRepo.find.mockResolvedValue([{ id: 'a', slug: 'acme', name: 'Acme' }]);

      await expect(service.listTenants(ADMIN_ID)).resolves.toEqual([
        { id: 'a', slug: 'acme', name: 'Acme' },
      ]);
    });

    it('배정이 없으면 테넌트를 조회하지 않는다', async () => {
      mappingRepo.find.mockResolvedValue([])
      await expect(service.listTenants(ADMIN_ID)).resolves.toEqual([]);
      expect(tenantRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('replaceAssignments', () => {
    it('중복을 제거해 저장한다', async () => {
      const manager = {
        delete: jest.fn().mockResolvedValue(undefined),
        insert: jest.fn().mockResolvedValue(undefined),
      };
      await service.replaceAssignments(ADMIN_ID, ['a', 'b', 'a'], manager as never);

      expect(manager.delete).toHaveBeenCalledWith(AdminUserTenant, { adminUserId: ADMIN_ID });
      expect(manager.insert).toHaveBeenCalledWith(AdminUserTenant, [
        { adminUserId: ADMIN_ID, tenantId: 'a' },
        { adminUserId: ADMIN_ID, tenantId: 'b' },
      ]);
    });

    it('빈 목록이면 삭제만 하고 삽입하지 않는다', async () => {
      const manager = {
        delete: jest.fn().mockResolvedValue(undefined),
        insert: jest.fn().mockResolvedValue(undefined),
      };
      await service.replaceAssignments(ADMIN_ID, [], manager as never);

      expect(manager.delete).toHaveBeenCalled();
      expect(manager.insert).not.toHaveBeenCalled();
    });
  });
});
