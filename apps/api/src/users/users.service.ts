import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  AuditAction,
  AuthorizationCode,
  AccessToken,
  Consent,
  RefreshToken,
  Tenant,
  User,
  UserProfile,
  UserStatus,
} from '../database/entities';
import { CryptoUtil } from '../common/crypto/crypto.util';
import { AuditService, AuditContext } from '../common/audit/audit.service';
import { MailService } from '../common/mail/mail.service';
import { ProfileSchemaService } from '../profile-schema/profile-schema.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SelfUpdateUserDto } from './dto/self-update-user.dto';

export interface UserListQuery {
  page?: number; // 1-based, 기본값 1
  limit?: number; // 기본값 20, 최대 100
  search?: string; // email 부분 검색
  status?: UserStatus; // 'ACTIVE' | 'INACTIVE' | 'LOCKED'
  pending?: boolean; // true면 관리자 승인 대기 사용자만 (status보다 우선)
}

export interface BulkUserActionResult {
  succeeded: string[];
  failed: { userId: string; reason: string }[];
}

export interface UserPage {
  items: User[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly profileSchemaService: ProfileSchemaService,
    private readonly auditService: AuditService,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(AccessToken)
    private readonly accessTokenRepo: Repository<AccessToken>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly mailService: MailService,
  ) {}

  async create(tenantId: string, dto: CreateUserDto, ctx?: AuditContext): Promise<User> {
    const exists = await this.userRepo.findOne({
      where: { tenantId, email: dto.email },
    });
    if (exists) throw new ConflictException(`Email '${dto.email}' already exists`);

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

  async findAll(tenantId: string, query: UserListQuery = {}): Promise<UserPage> {
    const { page = 1, limit: rawLimit = 20, search, status } = query;
    const limit = Math.min(rawLimit, 100);
    const offset = (page - 1) * limit;

    const qb = this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.profile', 'profile')
      .leftJoinAndSelect('u.userRoles', 'userRole')
      .leftJoinAndSelect('userRole.role', 'role')
      .where('u.tenantId = :tenantId', { tenantId })
      .orderBy('u.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (search) {
      qb.andWhere('(u.email ILIKE :search OR profile.profile_jsonb::text ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    if (query.pending) {
      // 관리자 승인 대기: 보류(approvalHeldAt)·탈퇴(deactivatedAt)는 제외한다.
      qb.andWhere('u.status = :status', { status: UserStatus.INACTIVE })
        .andWhere('u.pendingApprovalSince IS NOT NULL')
        .andWhere('u.deactivatedAt IS NULL')
        .andWhere('u.approvalHeldAt IS NULL');
    } else if (status) {
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

  /**
   * 엔드유저가 본인 프로필/loginId 를 수정한다.
   * 관리자용 update() 와 분리한 이유:
   *  - status 필드는 본인이 변경할 수 없어야 한다.
   *  - audit actorType 이 'user' 고정이다.
   *  - 호출부가 TenantAdminGuard 없이 access_token 만으로 도달한다.
   */
  async updateSelf(
    tenantId: string,
    userId: string,
    dto: SelfUpdateUserDto,
    ctx?: AuditContext,
  ): Promise<User> {
    const user = await this.findOne(tenantId, userId);

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
      actorType: 'user',
      actorId: ctx?.actorId ?? userId,
      targetType: 'user',
      targetId: userId,
      metadata: { source: 'self_service', dto },
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      requestId: ctx?.requestId ?? null,
    });

    return saved;
  }

  async changePassword(
    tenantId: string,
    id: string,
    password: string,
    ctx?: AuditContext,
  ): Promise<void> {
    const user = await this.findOne(tenantId, id);
    user.passwordHash = await CryptoUtil.hash(password);
    await this.userRepo.save(user);

    await this.auditService.record({
      tenantId,
      action: AuditAction.USER_UPDATED,
      targetType: 'user',
      targetId: id,
      metadata: { field: 'password' },
      ...ctx,
    });
  }

  async activate(tenantId: string, id: string, ctx?: AuditContext): Promise<void> {
    const user = await this.findOne(tenantId, id);
    user.status = UserStatus.ACTIVE;
    user.deactivatedAt = null;
    // 관리자 승인 대기 표식을 지운다. 남겨 두면 승인 이후에도 대기 알림이 계속 발송된다.
    user.pendingApprovalSince = null;
    // 보류 표식도 해제한다. 보류된 사용자를 되돌리는 유일한 경로가 활성화다.
    user.approvalHeldAt = null;
    await this.userRepo.save(user);
    await this.auditService.record({
      tenantId,
      action: AuditAction.USER_ACTIVATED,
      targetType: 'user',
      targetId: id,
      ...ctx,
    });
  }

  /**
   * 가입 승인 보류(거절). 관리자 승인 대기 사용자에게만 허용하며, INACTIVE를 유지한 채
   * approvalHeldAt만 기록해 승인 대기 집계·알림에서 제외한다. 사유는 감사 로그에만 남긴다.
   */
  async hold(
    tenantId: string,
    id: string,
    reason: string | null,
    ctx?: AuditContext,
  ): Promise<void> {
    const user = await this.findOne(tenantId, id);
    const isPendingApproval =
      user.status === UserStatus.INACTIVE &&
      user.pendingApprovalSince !== null &&
      user.deactivatedAt === null &&
      user.approvalHeldAt === null;
    if (!isPendingApproval) throw new ConflictException('not_pending_approval');

    user.approvalHeldAt = new Date();
    await this.userRepo.save(user);
    await this.auditService.record({
      tenantId,
      action: AuditAction.USER_APPROVAL_HELD,
      targetType: 'user',
      targetId: id,
      metadata: { email: user.email, ...(reason ? { reason } : {}) },
      ...ctx,
    });
  }

  /** 일괄 승인(활성화). 건별 부분 성공 — INACTIVE가 아니면 실패 목록으로 보낸다. */
  async bulkActivate(
    tenantId: string,
    userIds: string[],
    ctx?: AuditContext,
  ): Promise<BulkUserActionResult> {
    return this.bulkRun(tenantId, userIds, async (user) => {
      if (user.status !== UserStatus.INACTIVE) throw new ConflictException('not_inactive');
      await this.activate(tenantId, user.id, ctx);
    });
  }

  /** 일괄 보류. 건별 부분 성공 — 승인 대기 사용자가 아니면 실패 목록으로 보낸다. */
  async bulkHold(
    tenantId: string,
    userIds: string[],
    reason: string | null,
    ctx?: AuditContext,
  ): Promise<BulkUserActionResult> {
    return this.bulkRun(tenantId, userIds, (user) => this.hold(tenantId, user.id, reason, ctx));
  }

  /** 중복 제거 후 건별 try/catch로 처리하고 부분 성공 결과를 모은다. */
  private async bulkRun(
    tenantId: string,
    userIds: string[],
    action: (user: User) => Promise<void>,
  ): Promise<BulkUserActionResult> {
    const result: BulkUserActionResult = { succeeded: [], failed: [] };
    for (const userId of new Set(userIds)) {
      try {
        const user = await this.findOne(tenantId, userId);
        await action(user);
        result.succeeded.push(userId);
      } catch (error) {
        const reason =
          error instanceof NotFoundException ? 'not_found' : (error as Error).message;
        result.failed.push({ userId, reason });
      }
    }
    return result;
  }

  async deactivate(tenantId: string, id: string, ctx?: AuditContext): Promise<void> {
    const user = await this.findOne(tenantId, id);
    user.status = UserStatus.INACTIVE;
    user.deactivatedAt = new Date();

    await this.dataSource.transaction(async (manager) => {
      await manager.save(User, user);
      await manager.update(AccessToken, { tenantId, userId: id }, { revoked: true });
      await manager.update(RefreshToken, { tenantId, userId: id }, { revoked: true });
    });

    await this.auditService.record({
      tenantId,
      action: AuditAction.USER_DEACTIVATED,
      targetType: 'user',
      targetId: id,
      ...ctx,
    });

    // 이메일 인증 옵션이 켜진 테넌트는 비활성화 안내 메일 발송(best-effort, 실패해도 탈퇴 자체는 성공)
    // 발송 여부를 가리는 테넌트 조회도 이 블록 안에 포함한다: 조회 자체가 실패해도
    // (이미 커밋·감사 완료된) deactivate()가 거부되어 클라이언트가 재시도하면
    // deactivatedAt이 새 시각으로 덮여 자동 삭제 예정일이 계속 뒤로 밀리는 문제를 막는다.
    try {
      const tenant = await this.tenantRepo.findOne({
        where: { id: tenantId },
        relations: ['settings'],
      });
      if (tenant?.settings?.emailVerificationRequired) {
        await this.mailService.sendAccountDeactivatedEmail({
          to: user.email,
          serviceName: tenant.name ?? '계정',
          from: tenant.settings.mailFrom ?? null,
          devRedirectTo: tenant.settings.mailDevRedirectTo ?? null,
        });
      }
    } catch (error) {
      this.logger.error(`비활성화 안내 메일 처리 실패 userId=${id}: ${(error as Error).message}`);
    }
  }

  async lock(tenantId: string, id: string, ctx?: AuditContext): Promise<void> {
    const user = await this.findOne(tenantId, id);
    user.status = UserStatus.LOCKED;
    await this.userRepo.save(user);
    await this.auditService.record({
      tenantId,
      action: AuditAction.USER_LOCKED,
      targetType: 'user',
      targetId: id,
      ...ctx,
    });
  }

  async unlock(tenantId: string, id: string, ctx?: AuditContext): Promise<void> {
    const user = await this.findOne(tenantId, id);
    user.status = UserStatus.ACTIVE;
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.deactivatedAt = null;
    await this.userRepo.save(user);
    await this.auditService.record({
      tenantId,
      action: AuditAction.USER_UNLOCKED,
      targetType: 'user',
      targetId: id,
      ...ctx,
    });
  }

  async delete(tenantId: string, id: string, ctx?: AuditContext): Promise<void> {
    const user = await this.findOne(tenantId, id);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(Consent, { tenantId, userId: id });
      await manager.delete(AccessToken, { tenantId, userId: id });
      await manager.delete(RefreshToken, { tenantId, userId: id });
      await manager.delete(AuthorizationCode, { tenantId, userId: id });
      await manager.delete(UserProfile, { userId: id });
      await manager.delete(User, { tenantId, id });
    });

    await this.auditService.record({
      tenantId,
      action: AuditAction.USER_DELETED,
      targetType: 'user',
      targetId: id,
      metadata: { email: user.email },
      ...ctx,
    });
  }
}
