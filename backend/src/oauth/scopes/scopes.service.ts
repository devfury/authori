import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TenantScope } from '../../database/entities';
import { CreateScopeDto } from './dto/create-scope.dto';
import { UpdateScopeDto } from './dto/update-scope.dto';

export const DEFAULT_TENANT_SCOPES: ReadonlyArray<
  Pick<TenantScope, 'name' | 'displayName' | 'description' | 'isDefault'>
> = [
  {
    name: 'openid',
    displayName: 'OpenID',
    description: 'Authenticate the user and issue an OpenID Connect subject.',
    isDefault: true,
  },
  {
    name: 'profile',
    displayName: 'Profile',
    description: 'Read the user profile claims.',
    isDefault: true,
  },
  {
    name: 'email',
    displayName: 'Email',
    description: 'Read the user email address.',
    isDefault: true,
  },
];

@Injectable()
export class ScopesService {
  constructor(
    @InjectRepository(TenantScope)
    private readonly scopeRepo: Repository<TenantScope>,
  ) {}

  async seedDefaults(tenantId: string): Promise<void> {
    const existing = await this.scopeRepo.find({
      where: {
        tenantId,
        name: In(DEFAULT_TENANT_SCOPES.map((scope) => scope.name)),
      },
    });
    const existingNames = new Set(existing.map((scope) => scope.name));
    const missing = DEFAULT_TENANT_SCOPES.filter(
      (scope) => !existingNames.has(scope.name),
    ).map((scope) => this.scopeRepo.create({ tenantId, ...scope }));

    if (missing.length > 0) {
      await this.scopeRepo.save(missing);
    }
  }

  async getSupportedScopes(tenantId: string): Promise<string[]> {
    const scopes = await this.scopeRepo.find({
      where: { tenantId },
      order: { isDefault: 'DESC', name: 'ASC' },
    });

    if (scopes.length === 0) {
      return DEFAULT_TENANT_SCOPES.map((scope) => scope.name);
    }

    return scopes.map((scope) => scope.name);
  }

  async getScopeDetails(
    tenantId: string,
    names: string[],
  ): Promise<TenantScope[]> {
    const uniqueNames = Array.from(new Set(names));
    if (uniqueNames.length === 0) return [];

    const scopes = await this.scopeRepo.find({
      where: { tenantId, name: In(uniqueNames) },
      order: { isDefault: 'DESC', name: 'ASC' },
    });
    const byName = new Map(scopes.map((scope) => [scope.name, scope]));

    return uniqueNames
      .map((name) => byName.get(name))
      .filter((scope): scope is TenantScope => scope !== undefined);
  }

  async findAll(tenantId: string): Promise<TenantScope[]> {
    return this.scopeRepo.find({
      where: { tenantId },
      order: { isDefault: 'DESC', name: 'ASC' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<TenantScope> {
    const scope = await this.scopeRepo.findOne({ where: { tenantId, id } });
    if (!scope) throw new NotFoundException('scope_not_found');
    return scope;
  }

  async create(tenantId: string, dto: CreateScopeDto): Promise<TenantScope> {
    const exists = await this.scopeRepo.findOne({ where: { tenantId, name: dto.name } });
    if (exists) throw new BadRequestException('scope_already_exists');
    return this.scopeRepo.save(
      this.scopeRepo.create({ tenantId, ...dto, isDefault: false }),
    );
  }

  async update(tenantId: string, id: string, dto: UpdateScopeDto): Promise<TenantScope> {
    const scope = await this.findOne(tenantId, id);
    Object.assign(scope, dto);
    return this.scopeRepo.save(scope);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const scope = await this.findOne(tenantId, id);
    if (scope.isDefault) throw new BadRequestException('cannot_delete_default_scope');
    await this.scopeRepo.remove(scope);
  }

  async assertScopesExist(tenantId: string, names: string[]): Promise<void> {
    const uniqueNames = Array.from(new Set(names));
    if (uniqueNames.length === 0) return;

    const scopes = await this.scopeRepo.find({
      where: { tenantId, name: In(uniqueNames) },
      select: ['name'],
    });
    const found = new Set(scopes.map((scope) => scope.name));
    const invalid = uniqueNames.filter((name) => !found.has(name));

    if (invalid.length > 0) {
      throw new BadRequestException(`invalid_scope: ${invalid.join(', ')}`);
    }
  }
}
