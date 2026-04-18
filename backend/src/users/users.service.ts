import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  AuditAction,
  User,
  UserProfile,
  UserStatus,
} from '../database/entities';
import { CryptoUtil } from '../common/crypto/crypto.util';
import { AuditService, AuditContext } from '../common/audit/audit.service';
import { ProfileSchemaService } from '../profile-schema/profile-schema.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

export interface UserListQuery {
  page?: number; // 1-based, 기본값 1
  limit?: number; // 기본값 20, 최대 100
  search?: string; // email 또는 name 부분 검색
  status?: UserStatus; // 'ACTIVE' | 'INACTIVE' | 'LOCKED'
}

export interface UserPage {
  items: User[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly profileSchemaService: ProfileSchemaService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    tenantId: string,
    dto: CreateUserDto,
    ctx?: AuditContext,
  ): Promise<User> {
    const exists = await this.userRepo.findOne({
      where: { tenantId, email: dto.email },
    });
    if (exists)
      throw new ConflictException(`Email '${dto.email}' already exists`);

    const profileData = dto.profile ?? {};
    await this.profileSchemaService.validate(tenantId, profileData);

    const passwordHash = await CryptoUtil.hash(dto.password);

    const activeSchema = await this.profileSchemaService.findActive(tenantId);

    const profile = this.profileRepo.create({
      tenantId,
      schemaVersionId: activeSchema?.id ?? null,
      profileJsonb: profileData,
    });

    const user = this.userRepo.create({
      tenantId,
      email: dto.email,
      name: dto.name ?? null,
      loginId: dto.loginId ?? null,
      passwordHash,
      status: dto.initialStatus ?? UserStatus.ACTIVE,
      profile,
    });

    const saved = await this.userRepo.save(user);
    await this.auditService.record({
      tenantId,
      action: AuditAction.USER_CREATED,
      targetType: 'user',
      targetId: saved.id,
      metadata: { email: saved.email },
      ...ctx,
    });
    return saved;
  }

  async findAll(
    tenantId: string,
    query: UserListQuery = {},
  ): Promise<UserPage> {
    const { page = 1, limit: rawLimit = 20, search, status } = query;
    const limit = Math.min(rawLimit, 100);
    const offset = (page - 1) * limit;

    const qb = this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.profile', 'profile')
      .where('u.tenantId = :tenantId', { tenantId })
      .orderBy('u.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (search) {
      qb.andWhere('(u.email ILIKE :search OR u.name ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    if (status) {
      qb.andWhere('u.status = :status', { status });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async findOne(tenantId: string, id: string): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { tenantId, id },
      relations: ['profile'],
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateUserDto,
    ctx?: AuditContext,
  ): Promise<User> {
    const user = await this.findOne(tenantId, id);

    if (dto.status) user.status = dto.status;
    if (dto.name !== undefined) user.name = dto.name ?? null;
    if (dto.loginId !== undefined) user.loginId = dto.loginId;

    if (dto.profile) {
      const merged = { ...user.profile.profileJsonb, ...dto.profile };
      await this.profileSchemaService.validate(tenantId, merged);

      const activeSchema = await this.profileSchemaService.findActive(tenantId);
      user.profile.profileJsonb = merged;
      user.profile.schemaVersionId = activeSchema?.id ?? null;
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      if (dto.profile) {
        await manager.save(UserProfile, user.profile);
      }
      return manager.save(User, user);
    });

    await this.auditService.record({
      tenantId,
      action: AuditAction.USER_UPDATED,
      targetType: 'user',
      targetId: id,
      metadata: { dto },
      ...ctx,
    });

    return saved;
  }

  async activate(
    tenantId: string,
    id: string,
    ctx?: AuditContext,
  ): Promise<void> {
    const user = await this.findOne(tenantId, id);
    user.status = UserStatus.ACTIVE;
    await this.userRepo.save(user);
    await this.auditService.record({
      tenantId,
      action: AuditAction.USER_ACTIVATED,
      targetType: 'user',
      targetId: id,
      ...ctx,
    });
  }

  async deactivate(
    tenantId: string,
    id: string,
    ctx?: AuditContext,
  ): Promise<void> {
    const user = await this.findOne(tenantId, id);
    user.status = UserStatus.INACTIVE;
    await this.userRepo.save(user);
    await this.auditService.record({
      tenantId,
      action: AuditAction.USER_DEACTIVATED,
      targetType: 'user',
      targetId: id,
      ...ctx,
    });
  }
}
