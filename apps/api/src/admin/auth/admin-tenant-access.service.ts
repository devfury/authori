import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { AdminUserTenant, Tenant } from '../../database/entities';

/** 관리자에게 보여줄 테넌트 최소 정보. 전체 엔티티를 흘리지 않는다. */
export interface AdminTenantRef {
  id: string;
  slug: string;
  name: string;
}

/**
 * 관리자 ↔ 테넌트 배정 조회·갱신.
 *
 * 가드가 리포지토리를 직접 다루지 않도록 사이에 둔 얇은 층이다.
 * 배정은 JWT 에 담지 않고 매 요청 여기서 확인하므로, 배정 해제가 기존 토큰에도
 * 즉시 반영된다.
 */
@Injectable()
export class AdminTenantAccessService {
  constructor(
    @InjectRepository(AdminUserTenant)
    private readonly mappingRepo: Repository<AdminUserTenant>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  /** 복합 PK 를 그대로 타는 존재 확인 1회. */
  async isMember(adminUserId: string, tenantId: string): Promise<boolean> {
    if (!adminUserId || !tenantId) return false;
    return this.mappingRepo.exists({ where: { adminUserId, tenantId } });
  }

  async listTenantIds(adminUserId: string): Promise<string[]> {
    const rows = await this.mappingRepo.find({
      where: { adminUserId },
      select: { tenantId: true },
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => row.tenantId);
  }

  async listTenants(adminUserId: string): Promise<AdminTenantRef[]> {
    const tenantIds = await this.listTenantIds(adminUserId);
    if (tenantIds.length === 0) return [];

    const tenants = await this.tenantRepo.find({
      where: { id: In(tenantIds) },
      select: { id: true, slug: true, name: true },
      order: { name: 'ASC' },
    });
    return tenants.map((t) => ({ id: t.id, slug: t.slug, name: t.name }));
  }

  /**
   * 배정을 통째로 교체한다(set semantics).
   * 관리자 저장과 같은 트랜잭션에 묶이도록 EntityManager 를 받는다.
   */
  async replaceAssignments(
    adminUserId: string,
    tenantIds: string[],
    manager: EntityManager,
  ): Promise<void> {
    await manager.delete(AdminUserTenant, { adminUserId });

    const unique = [...new Set(tenantIds)];
    if (unique.length === 0) return;

    await manager.insert(
      AdminUserTenant,
      unique.map((tenantId) => ({ adminUserId, tenantId })),
    );
  }
}
