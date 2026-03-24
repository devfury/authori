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

export interface AdminJwtPayload {
  sub: string;
  email: string;
  role: AdminRole;
  tenantId: string | null;
  type: 'admin';
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
      passwordHash,
      role: dto.role,
      tenantId: dto.tenantId ?? null,
    });
    return this.adminRepo.save(admin);
  }

  async findAll(): Promise<AdminUser[]> {
    return this.adminRepo.find({ order: { createdAt: 'DESC' } });
  }

  async deactivate(id: string): Promise<void> {
    await this.adminRepo.update(id, { status: AdminStatus.INACTIVE });
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
      passwordHash,
      role: AdminRole.PLATFORM_ADMIN,
      tenantId: null,
    });
    await this.adminRepo.save(admin);

    return { message: 'Platform admin created successfully' };
  }
}
