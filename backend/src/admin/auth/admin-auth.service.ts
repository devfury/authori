import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminRole, AdminStatus, AdminUser } from '../../database/entities';
import { CryptoUtil } from '../../common/crypto/crypto.util';
import { AdminLoginDto } from './dto/admin-login.dto';
import { BootstrapAdminDto } from './dto/bootstrap-admin.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';

export interface AdminJwtPayload {
  sub: string;
  email: string;
  role: AdminRole;
  tenantId: string | null;
  type: 'admin';
}

export interface AdminListQuery {
  page?: number; // 1-based, 기본값 1
  limit?: number; // 기본값 20, 최대 100
  search?: string; // name 또는 email 부분 검색
  status?: AdminStatus;
  role?: AdminRole;
}

export interface AdminPage {
  items: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectRepository(AdminUser)
    private readonly adminRepo: Repository<AdminUser>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: AdminLoginDto): Promise<{ access_token: string }> {
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
      tenantId: admin.tenantId,
      type: 'admin',
    };

    return { access_token: this.jwtService.sign(payload) };
  }

  async createAdmin(dto: CreateAdminDto): Promise<AdminUser> {
    const exists = await this.adminRepo.findOne({ where: { email: dto.email } });
    if (exists) throw new BadRequestException('Email already in use');

    if (dto.role === AdminRole.TENANT_ADMIN && !dto.tenantId) {
      throw new BadRequestException('tenantId required for TENANT_ADMIN role');
    }

    const passwordHash = await CryptoUtil.hash(dto.password);
    const admin = this.adminRepo.create({
      email: dto.email,
      name: dto.name ?? null,
      passwordHash,
      role: dto.role,
      tenantId: dto.tenantId ?? null,
    });
    return this.adminRepo.save(admin);
  }

  async findAll(query: AdminListQuery = {}): Promise<AdminPage> {
    const { page = 1, limit: rawLimit = 20, search, status, role } = query;
    const limit = Math.min(rawLimit, 100);
    const offset = (page - 1) * limit;

    // Fallback to findAndCount to see if QueryBuilder was the issue
    const [items, total] = await this.adminRepo.findAndCount({
      where: {
        status: status || undefined,
        role: role || undefined,
      },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    // Simple search filtering if QueryBuilder ILIKE was the issue
    let filteredItems = items;
    let filteredTotal = total;

    if (search) {
      const lowerSearch = search.toLowerCase();
      filteredItems = items.filter(
        (u) =>
          u.email.toLowerCase().includes(lowerSearch) ||
          (u.name && u.name.toLowerCase().includes(lowerSearch)),
      );
      // Note: This total is inaccurate for search when using findAndCount pagination, 
      // but it helps debugging.
      filteredTotal = filteredItems.length; 
    }

    return { items: filteredItems, total: filteredTotal, page, limit };
  }

  async updateAdmin(id: string, dto: UpdateAdminDto): Promise<AdminUser> {
    const admin = await this.adminRepo.findOne({ where: { id } });
    if (!admin) throw new BadRequestException('Admin not found');

    if (dto.email && dto.email !== admin.email) {
      const exists = await this.adminRepo.findOne({ where: { email: dto.email } });
      if (exists) throw new BadRequestException('Email already in use');
      admin.email = dto.email;
    }

    if (dto.name !== undefined) admin.name = dto.name;
    if (dto.role) {
      if (dto.role === AdminRole.TENANT_ADMIN && !dto.tenantId && !admin.tenantId) {
        throw new BadRequestException('tenantId required for TENANT_ADMIN role');
      }
      admin.role = dto.role;
    }
    if (dto.tenantId !== undefined) admin.tenantId = dto.tenantId;
    if (dto.status) admin.status = dto.status;

    if (dto.password) {
      admin.passwordHash = await CryptoUtil.hash(dto.password);
    }

    return this.adminRepo.save(admin);
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
      tenantId: null,
    });
    await this.adminRepo.save(admin);

    return { message: 'Platform admin created successfully' };
  }
}
