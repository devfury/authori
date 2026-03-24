import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditAction, Tenant, TenantSettings, TenantStatus } from '../database/entities';
import { AuditService, AuditContext } from '../common/audit/audit.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(TenantSettings)
    private readonly settingsRepo: Repository<TenantSettings>,
    private readonly auditService: AuditService,
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

  async findAll(): Promise<Tenant[]> {
    return this.tenantRepo.find({ relations: ['settings'], order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({ where: { id }, relations: ['settings'] });
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto): Promise<Tenant> {
    const tenant = await this.findOne(id);

    if (dto.name) tenant.name = dto.name;
    if (dto.issuer !== undefined) tenant.issuer = dto.issuer;
    if (dto.status) tenant.status = dto.status;

    if (dto.settings) {
      Object.assign(tenant.settings, dto.settings);
      await this.settingsRepo.save(tenant.settings);
    }

    return this.tenantRepo.save(tenant);
  }

  async deactivate(id: string): Promise<Tenant> {
    const tenant = await this.findOne(id);
    tenant.status = TenantStatus.INACTIVE;
    return this.tenantRepo.save(tenant);
  }
}
