import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  AuditAction,
  Tenant,
  TenantSettings,
  TenantStatus,
} from '../database/entities';
import { AuditService, AuditContext } from '../common/audit/audit.service';
import { ScopesService } from '../oauth/scopes/scopes.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

export interface TenantListQuery {
  page?: number; // 1-based, 기본값 1
  limit?: number; // 기본값 20, 최대 100
  search?: string; // name 또는 slug 부분 검색
  status?: TenantStatus;
}

export interface TenantPage {
  items: Tenant[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(TenantSettings)
    private readonly settingsRepo: Repository<TenantSettings>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly scopesService: ScopesService,
  ) {}

  async create(dto: CreateTenantDto, ctx?: AuditContext): Promise<Tenant> {
    const exists = await this.tenantRepo.findOne({ where: { slug: dto.slug } });
    if (exists) {
      throw new ConflictException(`Slug '${dto.slug}' is already taken`);
    }

    const settings = this.settingsRepo.create(dto.settings ?? {});
    const tenant = this.tenantRepo.create({
      slug: dto.slug,
      name: dto.name,
      issuer: dto.issuer ?? null,
      settings,
    });

    const saved = await this.tenantRepo.save(tenant);
    await this.scopesService.seedDefaults(saved.id);
    await this.auditService.record({
      tenantId: saved.id,
      action: AuditAction.TENANT_CREATED,
      targetType: 'tenant',
      targetId: saved.id,
      metadata: { slug: saved.slug },
      ...ctx,
    });
    return saved;
  }

  async findAll(query: TenantListQuery = {}): Promise<TenantPage> {
    const { page = 1, limit: rawLimit = 20, search, status } = query;
    const limit = Math.min(rawLimit, 100);
    const offset = (page - 1) * limit;

    const qb = this.tenantRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.settings', 'settings')
      .orderBy('t.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (search) {
      qb.andWhere('(t.name ILIKE :search OR t.slug ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    if (status) {
      qb.andWhere('t.status = :status', { status });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async findOne(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({
      where: { id },
      relations: ['settings'],
    });
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto): Promise<Tenant> {
    const tenant = await this.findOne(id);

    if (dto.name) tenant.name = dto.name;
    if (dto.issuer !== undefined) tenant.issuer = dto.issuer;
    if (dto.status) tenant.status = dto.status;

    return this.dataSource.transaction(async (manager) => {
      if (dto.settings) {
        Object.assign(tenant.settings, dto.settings);
        await manager.save(TenantSettings, tenant.settings);
      }
      return manager.save(Tenant, tenant);
    });
  }

  async deactivate(id: string): Promise<Tenant> {
    const tenant = await this.findOne(id);
    tenant.status = TenantStatus.INACTIVE;
    return this.tenantRepo.save(tenant);
  }

  async deletePermanently(id: string, ctx?: AuditContext): Promise<void> {
    const tenant = await this.findOne(id);

    await this.dataSource.transaction(async (manager) => {
      const qr = manager.queryRunner!;

      // 1. authorization_codes
      await qr.query(
        `DELETE FROM authorization_codes
         WHERE user_id IN (SELECT id FROM users WHERE tenant_id = $1)
            OR client_id IN (SELECT client_id FROM oauth_clients WHERE tenant_id = $1)`,
        [id],
      );

      // 2. access_tokens
      await qr.query(
        `DELETE FROM access_tokens
         WHERE user_id IN (SELECT id FROM users WHERE tenant_id = $1)
            OR client_id IN (SELECT client_id FROM oauth_clients WHERE tenant_id = $1)`,
        [id],
      );

      // 3. refresh_tokens
      await qr.query(
        `DELETE FROM refresh_tokens
         WHERE user_id IN (SELECT id FROM users WHERE tenant_id = $1)
            OR client_id IN (SELECT client_id FROM oauth_clients WHERE tenant_id = $1)`,
        [id],
      );

      // 4. consents
      await qr.query(
        `DELETE FROM consents
         WHERE user_id IN (SELECT id FROM users WHERE tenant_id = $1)
            OR client_id IN (SELECT client_id FROM oauth_clients WHERE tenant_id = $1)`,
        [id],
      );

      // 5. oauth_client_redirect_uris
      await qr.query(
        `DELETE FROM oauth_client_redirect_uris
         WHERE client_id IN (SELECT client_id FROM oauth_clients WHERE tenant_id = $1)`,
        [id],
      );

      // 6. oauth_clients
      await qr.query(`DELETE FROM oauth_clients WHERE tenant_id = $1`, [id]);

      // 7. user_profiles
      await qr.query(
        `DELETE FROM user_profiles
         WHERE user_id IN (SELECT id FROM users WHERE tenant_id = $1)`,
        [id],
      );

      // 8. users
      await qr.query(`DELETE FROM users WHERE tenant_id = $1`, [id]);

      // 9. profile_schema_versions
      await qr.query(`DELETE FROM profile_schema_versions WHERE tenant_id = $1`, [id]);

      // 10. external_auth_providers
      await qr.query(`DELETE FROM external_auth_providers WHERE tenant_id = $1`, [id]);

      // 11. signing_keys
      await qr.query(`DELETE FROM signing_keys WHERE tenant_id = $1`, [id]);

      // 12. audit_logs — tenant_id를 NULL로 설정 (기록 보존)
      await qr.query(`UPDATE audit_logs SET tenant_id = NULL WHERE tenant_id = $1`, [id]);

      // 13. tenant_settings
      await qr.query(`DELETE FROM tenant_settings WHERE tenant_id = $1`, [id]);

      // 14. tenants (tenant_scopes, tenant_roles, tenant_permissions은 CASCADE)
      await qr.query(`DELETE FROM tenants WHERE id = $1`, [id]);
    });

    // 트랜잭션 커밋 후 감사 로그 기록 (테넌트가 삭제됐으므로 tenantId는 null)
    await this.auditService.record({
      tenantId: null,
      action: AuditAction.TENANT_DELETED,
      targetType: 'tenant',
      targetId: id,
      metadata: { slug: tenant.slug, name: tenant.name },
      ...ctx,
    });
  }
}
