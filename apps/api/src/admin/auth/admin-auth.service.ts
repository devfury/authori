import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  AdminRole,
  AdminStatus,
  AdminUser,
  Tenant,
  TenantStatus,
} from '../../database/entities';
import { CryptoUtil } from '../../common/crypto/crypto.util';
import { AdminLoginDto } from './dto/admin-login.dto';
import { BootstrapAdminDto } from './dto/bootstrap-admin.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { AdminTenantAccessService, AdminTenantRef } from './admin-tenant-access.service';

/**
 * 접근 가능한 테넌트는 담지 않는다. 배정은 매 요청 DB 에서 확인하므로
 * 배정 해제가 기존 토큰에도 즉시 반영된다.
 */
export interface AdminJwtPayload {
  sub: string;
  email: string;
  role: AdminRole;
  type: 'admin';
}

export interface AdminListQuery {
  page?: number; // 1-based, 기본값 1
  limit?: number; // 기본값 20, 최대 100
  search?: string; // name 또는 email 부분 검색
  status?: AdminStatus;
  role?: AdminRole;
}

/** 목록·상세 응답에 배정 테넌트를 붙인 형태. */
export type AdminUserWithTenants = AdminUser & { tenants: AdminTenantRef[] };

export interface AdminPage {
  items: AdminUserWithTenants[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminLoginResult {
  access_token: string;
  /** TENANT_ADMIN 의 배정 테넌트. PLATFORM_ADMIN 은 역할로 전체 접근이라 빈 배열이다. */
  tenants: AdminTenantRef[];
}

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectRepository(AdminUser)
    private readonly adminRepo: Repository<AdminUser>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly access: AdminTenantAccessService,
    private readonly dataSource: DataSource,
  ) {}

  async login(dto: AdminLoginDto): Promise<AdminLoginResult> {
    const admin = await this.adminRepo.findOne({
      where: { email: dto.email, status: AdminStatus.ACTIVE },
    });
    if (!admin) throw new UnauthorizedException('invalid_credentials');

    const valid = await CryptoUtil.verify(dto.password, admin.passwordHash);
    if (!valid) throw new UnauthorizedException('invalid_credentials');

    const payload: AdminJwtPayload = {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      type: 'admin',
    };

    return {
      access_token: this.jwtService.sign(payload),
      tenants: await this.tenantsOf(admin),
    };
  }

  /** 새로고침·토큰 재사용 시 프런트가 배정 목록을 다시 확보하는 경로. */
  async me(adminId: string): Promise<{
    id: string;
    email: string;
    name: string | null;
    role: AdminRole;
    tenants: AdminTenantRef[];
  }> {
    const admin = await this.adminRepo.findOne({ where: { id: adminId } });
    if (!admin) throw new UnauthorizedException('admin_not_found');

    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      tenants: await this.tenantsOf(admin),
    };
  }

  async createAdmin(dto: CreateAdminDto): Promise<AdminUserWithTenants> {
    const exists = await this.adminRepo.findOne({ where: { email: dto.email } });
    if (exists) throw new BadRequestException('Email already in use');

    const tenantIds = await this.resolveAssignments(dto.role, dto.tenantIds);

    const passwordHash = await CryptoUtil.hash(dto.password);

    const admin = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(
        manager.create(AdminUser, {
          email: dto.email,
          name: dto.name ?? null,
          passwordHash,
          role: dto.role,
        }),
      );
      await this.access.replaceAssignments(saved.id, tenantIds, manager);
      return saved;
    });

    return { ...admin, tenants: await this.access.listTenants(admin.id) };
  }

  async findAll(query: AdminListQuery = {}): Promise<AdminPage> {
    const { page = 1, limit: rawLimit = 20, search, status, role } = query;
    const limit = Math.min(rawLimit, 100);
    const offset = (page - 1) * limit;

    const qb = this.adminRepo
      .createQueryBuilder('admin')
      .orderBy('admin.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (search) {
      qb.andWhere('(admin.email ILIKE :search OR admin.name ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    if (status) {
      qb.andWhere('admin.status = :status', { status });
    }

    if (role) {
      qb.andWhere('admin.role = :role', { role });
    }

    const [admins, total] = await qb.getManyAndCount();

    const items = await Promise.all(
      admins.map(async (admin) => ({
        ...admin,
        tenants: await this.tenantsOf(admin),
      })),
    );

    return { items, total, page, limit };
  }

  async updateAdmin(id: string, dto: UpdateAdminDto): Promise<AdminUserWithTenants> {
    const admin = await this.adminRepo.findOne({ where: { id } });
    if (!admin) throw new BadRequestException('Admin not found');

    if (dto.email && dto.email !== admin.email) {
      const exists = await this.adminRepo.findOne({ where: { email: dto.email } });
      if (exists) throw new BadRequestException('Email already in use');
      admin.email = dto.email;
    }

    if (dto.name !== undefined) admin.name = dto.name;
    if (dto.status) admin.status = dto.status;
    if (dto.password) {
      admin.passwordHash = await CryptoUtil.hash(dto.password);
    }

    const nextRole = dto.role ?? admin.role;

    // tenantIds 미전달이면 기존 배정을 유지한다. 단, TENANT_ADMIN 으로 역할을
    // 바꾸는데 기존 배정이 없으면 접근할 수 있는 테넌트가 하나도 없는 계정이 된다.
    let nextTenantIds: string[] | undefined;
    if (dto.tenantIds !== undefined) {
      nextTenantIds = await this.resolveAssignments(nextRole, dto.tenantIds);
    } else if (nextRole === AdminRole.PLATFORM_ADMIN) {
      // 역할이 올라가면 배정은 의미가 없으므로 정리한다.
      nextTenantIds = [];
    } else if (dto.role === AdminRole.TENANT_ADMIN && admin.role !== AdminRole.TENANT_ADMIN) {
      const existing = await this.access.listTenantIds(id);
      if (existing.length === 0) {
        throw new BadRequestException('tenantIds required for TENANT_ADMIN role');
      }
    }

    admin.role = nextRole;

    const saved = await this.dataSource.transaction(async (manager) => {
      const result = await manager.save(admin);
      if (nextTenantIds !== undefined) {
        await this.access.replaceAssignments(id, nextTenantIds, manager);
      }
      return result;
    });

    return { ...saved, tenants: await this.access.listTenants(id) };
  }

  async deactivate(id: string): Promise<void> {
    await this.adminRepo.update(id, { status: AdminStatus.INACTIVE });
  }

  async isBootstrapNeeded(): Promise<{ needed: boolean }> {
    const exists = await this.adminRepo.findOne({
      where: { role: AdminRole.PLATFORM_ADMIN },
    });
    return { needed: !exists };
  }

  async bootstrap(dto: BootstrapAdminDto): Promise<{ message: string }> {
    const expectedSecret = this.configService.get<string>('app.platformAdminSecret');
    if (!expectedSecret || dto.secret !== expectedSecret) {
      throw new UnauthorizedException('invalid_secret');
    }

    const existingPlatformAdmin = await this.adminRepo.findOne({
      where: { role: AdminRole.PLATFORM_ADMIN },
    });
    if (existingPlatformAdmin) {
      throw new ConflictException('platform_admin_already_exists');
    }

    const passwordHash = await CryptoUtil.hash(dto.password);
    const admin = this.adminRepo.create({
      email: dto.email,
      name: dto.name ?? null,
      passwordHash,
      role: AdminRole.PLATFORM_ADMIN,
    });
    await this.adminRepo.save(admin);

    return { message: 'Platform admin created successfully' };
  }

  /** PLATFORM_ADMIN 은 역할로 전체 접근이므로 배정 목록을 만들지 않는다. */
  private async tenantsOf(admin: AdminUser): Promise<AdminTenantRef[]> {
    if (admin.role === AdminRole.PLATFORM_ADMIN) return [];
    return this.access.listTenants(admin.id);
  }

  /**
   * 역할에 맞는 배정 집합을 확정한다.
   * PLATFORM_ADMIN 에게는 배정하지 않고, TENANT_ADMIN 은 최소 1개를 요구하며,
   * 존재하지 않거나 비활성인 테넌트는 거부한다.
   */
  private async resolveAssignments(
    role: AdminRole,
    tenantIds: string[] | undefined,
  ): Promise<string[]> {
    if (role === AdminRole.PLATFORM_ADMIN) return [];

    const unique = [...new Set(tenantIds ?? [])];
    if (unique.length === 0) {
      throw new BadRequestException('tenantIds required for TENANT_ADMIN role');
    }

    const found = await this.tenantRepo.find({
      where: { id: In(unique), status: TenantStatus.ACTIVE },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      const foundIds = new Set(found.map((t) => t.id));
      const invalid = unique.filter((id) => !foundIds.has(id));
      throw new BadRequestException(
        `Unknown or inactive tenant: ${invalid.join(', ')}`,
      );
    }

    return unique;
  }
}
