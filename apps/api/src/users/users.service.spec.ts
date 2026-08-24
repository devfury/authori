import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import {
  UserStatus,
  AuditAction,
  Consent,
  AccessToken,
  RefreshToken,
  AuthorizationCode,
  UserProfile,
  User,
} from '../database/entities';

describe('UsersService', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';

  const profile = {
    id: 'profile-1',
    userId,
    tenantId,
    schemaVersionId: 'schema-1',
    profileJsonb: { name: 'Lee Jin Ho', department: 'Engineering' },
    updatedAt: new Date('2026-04-19T00:00:00.000Z'),
  };

  const user = {
    id: userId,
    tenantId,
    email: 'lee@example.com',
    loginId: null,
    passwordHash: 'hashed',
    status: UserStatus.ACTIVE,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: new Date('2026-04-19T00:00:00.000Z'),
    updatedAt: new Date('2026-04-19T00:00:00.000Z'),
    profile,
  };

  let service: UsersService;
  let userRepo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
  };

  beforeEach(() => {
    userRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
    };

    service = new UsersService(
      userRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('includes profile data when listing users', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[user], 1]),
    };
    userRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.findAll(tenantId);

    expect(userRepo.createQueryBuilder).toHaveBeenCalledWith('u');
    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('u.profile', 'profile');
    expect(result.items[0].profile.profileJsonb.name).toBe('Lee Jin Ho');
    expect(result.total).toBe(1);
  });

  it('searches email and all profile fields when search param is given', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[user], 1]),
    };
    userRepo.createQueryBuilder.mockReturnValue(qb);

    await service.findAll(tenantId, { search: '이몽룡' });

    expect(qb.andWhere).toHaveBeenCalledWith(
      '(u.email ILIKE :search OR profile.profile_jsonb::text ILIKE :search)',
      { search: '%이몽룡%' },
    );
  });

  it('includes profile data when finding one user', async () => {
    userRepo.findOne.mockResolvedValue(user);

    const result = await service.findOne(tenantId, userId);

    expect(userRepo.findOne).toHaveBeenCalledWith({
      where: { tenantId, id: userId },
      relations: ['profile'],
    });
    expect(result.profile.profileJsonb).toEqual({
      name: 'Lee Jin Ho',
      department: 'Engineering',
    });
  });

  it('throws NotFoundException when the user does not exist', async () => {
    userRepo.findOne.mockResolvedValue(null);

    await expect(service.findOne(tenantId, userId)).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('updateSelf', () => {
    let profileSchemaService: {
      validate: jest.Mock;
      findActive: jest.Mock;
    };
    let auditService: { record: jest.Mock };
    let dataSource: { transaction: jest.Mock };
    let profileRepoMock: { save: jest.Mock };
    let userRepoMock: {
      findOne: jest.Mock;
      save: jest.Mock;
    };

    beforeEach(() => {
      profileSchemaService = {
        validate: jest.fn().mockResolvedValue(undefined),
        findActive: jest.fn().mockResolvedValue({ id: 'schema-2' }),
      };
      auditService = { record: jest.fn().mockResolvedValue(undefined) };

      profileRepoMock = { save: jest.fn() };
      userRepoMock = {
        findOne: jest.fn().mockResolvedValue(structuredClone(user)),
        save: jest.fn().mockImplementation(async (u) => u),
      };

      const manager = {
        save: jest.fn().mockImplementation(async (_entity, value) => value),
      };
      dataSource = {
        transaction: jest.fn().mockImplementation(async (cb) => cb(manager)),
      };

      service = new UsersService(
        userRepoMock as never,
        profileRepoMock as never,
        dataSource as never,
        profileSchemaService as never,
        auditService as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
    });

    it('merges profile fields and validates against the active schema', async () => {
      const result = await service.updateSelf(tenantId, userId, {
        profile: { nickname: 'Johnny' },
      });

      expect(profileSchemaService.validate).toHaveBeenCalledWith(tenantId, {
        name: 'Lee Jin Ho',
        department: 'Engineering',
        nickname: 'Johnny',
      });
      expect(result.profile.profileJsonb).toEqual({
        name: 'Lee Jin Ho',
        department: 'Engineering',
        nickname: 'Johnny',
      });
      expect(result.profile.schemaVersionId).toBe('schema-2');
    });

    it('updates loginId when provided', async () => {
      const result = await service.updateSelf(tenantId, userId, {
        loginId: 'lee-jinho',
      });

      expect(result.loginId).toBe('lee-jinho');
    });

    it('records a USER_UPDATED audit event with actorType=user', async () => {
      await service.updateSelf(
        tenantId,
        userId,
        { profile: { nickname: 'J' } },
        { actorId: userId, ipAddress: '10.0.0.1' },
      );

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          action: 'USER.UPDATED',
          actorType: 'user',
          actorId: userId,
          targetType: 'user',
          targetId: userId,
          metadata: expect.objectContaining({ source: 'self_service' }),
          ipAddress: '10.0.0.1',
        }),
      );
    });

    it('throws NotFoundException when the user does not exist', async () => {
      userRepoMock.findOne.mockResolvedValue(null);

      await expect(service.updateSelf(tenantId, userId, { loginId: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('AuditAction has USER_UNLOCKED value', () => {
    expect(AuditAction.USER_UNLOCKED).toBe('USER.UNLOCKED');
  });

  describe('lock', () => {
    let userRepoMock: { findOne: jest.Mock; save: jest.Mock };
    let auditSvc: { record: jest.Mock };

    beforeEach(() => {
      userRepoMock = {
        findOne: jest.fn().mockResolvedValue({
          id: userId,
          tenantId,
          email: 'lee@example.com',
          status: UserStatus.ACTIVE,
          failedLoginAttempts: 0,
          lockedUntil: null,
          profile: { profileJsonb: {} },
        }),
        save: jest.fn().mockImplementation(async (u: unknown) => u),
      };
      auditSvc = { record: jest.fn().mockResolvedValue(undefined) };
      service = new UsersService(
        userRepoMock as never,
        {} as never,
        {} as never,
        {} as never,
        auditSvc as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
    });

    it('sets status to LOCKED', async () => {
      await service.lock(tenantId, userId);
      expect(userRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: UserStatus.LOCKED }),
      );
    });

    it('records USER_LOCKED audit action', async () => {
      await service.lock(tenantId, userId);
      expect(auditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.USER_LOCKED }),
      );
    });

    it('throws NotFoundException when user not found', async () => {
      userRepoMock.findOne.mockResolvedValue(null);
      await expect(service.lock(tenantId, userId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('unlock', () => {
    let userRepoMock: { findOne: jest.Mock; save: jest.Mock };
    let auditSvc: { record: jest.Mock };

    beforeEach(() => {
      userRepoMock = {
        findOne: jest.fn().mockResolvedValue({
          id: userId,
          tenantId,
          email: 'lee@example.com',
          status: UserStatus.LOCKED,
          failedLoginAttempts: 5,
          lockedUntil: new Date('2026-06-01'),
          deactivatedAt: new Date('2026-05-01'),
          profile: { profileJsonb: {} },
        }),
        save: jest.fn().mockImplementation(async (u: unknown) => u),
      };
      auditSvc = { record: jest.fn().mockResolvedValue(undefined) };
      service = new UsersService(
        userRepoMock as never,
        {} as never,
        {} as never,
        {} as never,
        auditSvc as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
    });

    it('sets status to ACTIVE, resets failedLoginAttempts and lockedUntil', async () => {
      await service.unlock(tenantId, userId);
      expect(userRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: UserStatus.ACTIVE,
          failedLoginAttempts: 0,
          lockedUntil: null,
        }),
      );
    });

    it('clears deactivatedAt (cancels scheduled deletion)', async () => {
      await service.unlock(tenantId, userId);
      expect(userRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ deactivatedAt: null }),
      );
    });

    it('records USER_UNLOCKED audit action', async () => {
      await service.unlock(tenantId, userId);
      expect(auditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.USER_UNLOCKED }),
      );
    });

    it('throws NotFoundException when user not found', async () => {
      userRepoMock.findOne.mockResolvedValue(null);
      await expect(service.unlock(tenantId, userId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('AuditAction has USER_DELETED value', () => {
    expect(AuditAction.USER_DELETED).toBe('USER.DELETED');
  });

  describe('delete', () => {
    let userRepoMock: { findOne: jest.Mock };
    let auditSvc: { record: jest.Mock };
    let dataSource: { transaction: jest.Mock };
    let managerMock: { delete: jest.Mock; remove: jest.Mock };

    const userToDelete = {
      id: userId,
      tenantId,
      email: 'lee@example.com',
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
      lockedUntil: null,
      profile: { profileJsonb: {} },
    };

    beforeEach(() => {
      userRepoMock = {
        findOne: jest.fn().mockResolvedValue(structuredClone(userToDelete)),
      };
      auditSvc = { record: jest.fn().mockResolvedValue(undefined) };
      managerMock = {
        delete: jest.fn().mockResolvedValue(undefined),
        remove: jest.fn().mockResolvedValue(undefined),
      };
      dataSource = {
        transaction: jest.fn().mockImplementation(async (cb) => cb(managerMock)),
      };

      service = new UsersService(
        userRepoMock as never,
        {} as never,
        dataSource as never,
        {} as never,
        auditSvc as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
    });

    it('deletes Consent, AccessToken, RefreshToken, AuthorizationCode, UserProfile then User in a transaction', async () => {
      await service.delete(tenantId, userId);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(managerMock.delete).toHaveBeenCalledTimes(6);
      expect(managerMock.remove).not.toHaveBeenCalled();
      expect(managerMock.delete).toHaveBeenNthCalledWith(1, Consent, { tenantId, userId });
      expect(managerMock.delete).toHaveBeenNthCalledWith(2, AccessToken, { tenantId, userId });
      expect(managerMock.delete).toHaveBeenNthCalledWith(3, RefreshToken, { tenantId, userId });
      expect(managerMock.delete).toHaveBeenNthCalledWith(4, AuthorizationCode, {
        tenantId,
        userId,
      });
      expect(managerMock.delete).toHaveBeenNthCalledWith(5, UserProfile, { userId });
      expect(managerMock.delete).toHaveBeenNthCalledWith(6, User, { tenantId, id: userId });
    });

    it('records USER_DELETED audit event after transaction', async () => {
      await service.delete(tenantId, userId, {
        actorId: 'admin-1',
        actorType: 'admin',
        ipAddress: '10.0.0.1',
        userAgent: 'test-agent',
        requestId: 'req-1',
      });

      expect(auditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          action: AuditAction.USER_DELETED,
          targetType: 'user',
          targetId: userId,
          metadata: { email: 'lee@example.com' },
          actorId: 'admin-1',
        }),
      );
    });

    it('throws NotFoundException when user does not exist', async () => {
      userRepoMock.findOne.mockResolvedValue(null);

      await expect(service.delete(tenantId, userId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('activate', () => {
    let userRepoMock: { findOne: jest.Mock; save: jest.Mock };
    let auditSvc: { record: jest.Mock };

    beforeEach(() => {
      userRepoMock = {
        findOne: jest.fn().mockResolvedValue({
          id: userId,
          tenantId,
          email: 'lee@example.com',
          status: UserStatus.INACTIVE,
          failedLoginAttempts: 0,
          lockedUntil: null,
          deactivatedAt: new Date('2026-05-01'),
          pendingApprovalSince: new Date('2026-05-01'),
          approvalHeldAt: new Date('2026-05-02'),
          profile: { profileJsonb: {} },
        }),
        save: jest.fn().mockImplementation(async (u: unknown) => u),
      };
      auditSvc = { record: jest.fn().mockResolvedValue(undefined) };
      service = new UsersService(
        userRepoMock as never,
        {} as never,
        {} as never,
        {} as never,
        auditSvc as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
    });

    it('clears pendingApprovalSince so digest notifications stop', async () => {
      await service.activate(tenantId, userId);
      expect(userRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ pendingApprovalSince: null }),
      );
    });

    it('clears approvalHeldAt (activating is the only way back from hold)', async () => {
      await service.activate(tenantId, userId);
      expect(userRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ approvalHeldAt: null }),
      );
    });

    it('sets status to ACTIVE and clears deactivatedAt (cancels scheduled deletion)', async () => {
      await service.activate(tenantId, userId);
      expect(userRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: UserStatus.ACTIVE, deactivatedAt: null }),
      );
    });

    it('records USER_ACTIVATED audit action', async () => {
      await service.activate(tenantId, userId);
      expect(auditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.USER_ACTIVATED }),
      );
    });

    it('throws NotFoundException when user not found', async () => {
      userRepoMock.findOne.mockResolvedValue(null);
      await expect(service.activate(tenantId, userId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('hold', () => {
    let userRepoMock: { findOne: jest.Mock; save: jest.Mock };
    let auditSvc: { record: jest.Mock };

    const pendingUser = () => ({
      id: userId,
      tenantId,
      email: 'lee@example.com',
      status: UserStatus.INACTIVE,
      failedLoginAttempts: 0,
      lockedUntil: null,
      deactivatedAt: null as Date | null,
      pendingApprovalSince: new Date('2026-08-20T00:00:00Z') as Date | null,
      approvalHeldAt: null as Date | null,
      profile: { profileJsonb: {} },
    });

    beforeEach(() => {
      userRepoMock = {
        findOne: jest.fn().mockResolvedValue(pendingUser()),
        save: jest.fn().mockImplementation(async (u: unknown) => u),
      };
      auditSvc = { record: jest.fn().mockResolvedValue(undefined) };
      service = new UsersService(
        userRepoMock as never,
        {} as never,
        {} as never,
        {} as never,
        auditSvc as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
    });

    it('sets approvalHeldAt while keeping status INACTIVE and pendingApprovalSince', async () => {
      await service.hold(tenantId, userId, null);
      expect(userRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: UserStatus.INACTIVE,
          approvalHeldAt: expect.any(Date),
          pendingApprovalSince: expect.any(Date),
        }),
      );
    });

    it('records USER_APPROVAL_HELD with the reason in metadata', async () => {
      await service.hold(tenantId, userId, '서류 미비', { actorId: 'admin-1' });
      expect(auditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.USER_APPROVAL_HELD,
          targetId: userId,
          actorId: 'admin-1',
          metadata: { email: 'lee@example.com', reason: '서류 미비' },
        }),
      );
    });

    it('omits reason from metadata when not given', async () => {
      await service.hold(tenantId, userId, null);
      expect(auditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { email: 'lee@example.com' } }),
      );
    });

    it('rejects a user who is not pending approval (no pendingApprovalSince)', async () => {
      userRepoMock.findOne.mockResolvedValue({ ...pendingUser(), pendingApprovalSince: null });
      await expect(service.hold(tenantId, userId, null)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects a user who is already held', async () => {
      userRepoMock.findOne.mockResolvedValue({
        ...pendingUser(),
        approvalHeldAt: new Date('2026-08-21T00:00:00Z'),
      });
      await expect(service.hold(tenantId, userId, null)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects a deactivated user', async () => {
      userRepoMock.findOne.mockResolvedValue({
        ...pendingUser(),
        deactivatedAt: new Date('2026-08-21T00:00:00Z'),
      });
      await expect(service.hold(tenantId, userId, null)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('throws NotFoundException when user not found', async () => {
      userRepoMock.findOne.mockResolvedValue(null);
      await expect(service.hold(tenantId, userId, null)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('bulkActivate / bulkHold', () => {
    let userRepoMock: { findOne: jest.Mock; save: jest.Mock };
    let auditSvc: { record: jest.Mock };

    const usersById: Record<string, object> = {};

    const makeUser = (id: string, overrides: object = {}) => ({
      id,
      tenantId,
      email: `${id}@example.com`,
      status: UserStatus.INACTIVE,
      failedLoginAttempts: 0,
      lockedUntil: null,
      deactivatedAt: null,
      pendingApprovalSince: new Date('2026-08-20T00:00:00Z'),
      approvalHeldAt: null,
      profile: { profileJsonb: {} },
      ...overrides,
    });

    beforeEach(() => {
      for (const key of Object.keys(usersById)) delete usersById[key];
      usersById['u-pending'] = makeUser('u-pending');
      usersById['u-active'] = makeUser('u-active', {
        status: UserStatus.ACTIVE,
        pendingApprovalSince: null,
      });

      userRepoMock = {
        findOne: jest
          .fn()
          .mockImplementation(async ({ where }: { where: { id: string } }) =>
            usersById[where.id] ? structuredClone(usersById[where.id]) : null,
          ),
        save: jest.fn().mockImplementation(async (u: unknown) => u),
      };
      auditSvc = { record: jest.fn().mockResolvedValue(undefined) };
      service = new UsersService(
        userRepoMock as never,
        {} as never,
        {} as never,
        {} as never,
        auditSvc as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
    });

    it('bulkActivate activates INACTIVE users and reports the rest as failed', async () => {
      const result = await service.bulkActivate(tenantId, ['u-pending', 'u-active', 'u-missing']);

      expect(result.succeeded).toEqual(['u-pending']);
      expect(result.failed).toEqual(
        expect.arrayContaining([
          { userId: 'u-active', reason: 'not_inactive' },
          { userId: 'u-missing', reason: 'not_found' },
        ]),
      );
      expect(auditSvc.record).toHaveBeenCalledTimes(1);
      expect(auditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.USER_ACTIVATED, targetId: 'u-pending' }),
      );
    });

    it('bulkActivate deduplicates userIds', async () => {
      const result = await service.bulkActivate(tenantId, ['u-pending', 'u-pending']);
      expect(result.succeeded).toEqual(['u-pending']);
      expect(auditSvc.record).toHaveBeenCalledTimes(1);
    });

    it('bulkHold holds pending users and reports non-pending ones as failed', async () => {
      const result = await service.bulkHold(
        tenantId,
        ['u-pending', 'u-active', 'u-missing'],
        '정원 초과',
      );

      expect(result.succeeded).toEqual(['u-pending']);
      expect(result.failed).toEqual(
        expect.arrayContaining([
          { userId: 'u-active', reason: 'not_pending_approval' },
          { userId: 'u-missing', reason: 'not_found' },
        ]),
      );
      expect(auditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.USER_APPROVAL_HELD,
          targetId: 'u-pending',
          metadata: expect.objectContaining({ reason: '정원 초과' }),
        }),
      );
    });
  });

  describe('deactivate', () => {
    let userRepoMock: { findOne: jest.Mock };
    let auditSvc: { record: jest.Mock };
    let dataSource: { transaction: jest.Mock };
    let managerMock: { save: jest.Mock; update: jest.Mock };
    let tenantRepoMock: { findOne: jest.Mock };
    let mailServiceMock: { sendAccountDeactivatedEmail: jest.Mock };

    const userToDeactivate = {
      id: userId,
      tenantId,
      email: 'lee@example.com',
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
      lockedUntil: null,
      deactivatedAt: null,
      profile: { profileJsonb: {} },
    };

    beforeEach(() => {
      userRepoMock = {
        findOne: jest.fn().mockResolvedValue(structuredClone(userToDeactivate)),
      };
      auditSvc = { record: jest.fn().mockResolvedValue(undefined) };
      managerMock = {
        save: jest.fn().mockImplementation(async (_entity, value) => value),
        update: jest.fn().mockResolvedValue(undefined),
      };
      dataSource = {
        transaction: jest.fn().mockImplementation(async (cb) => cb(managerMock)),
      };
      tenantRepoMock = {
        findOne: jest.fn().mockResolvedValue({
          id: tenantId,
          name: 'ACME',
          settings: { emailVerificationRequired: false, mailFrom: null, mailDevRedirectTo: null },
        }),
      };
      mailServiceMock = { sendAccountDeactivatedEmail: jest.fn().mockResolvedValue(undefined) };

      service = new UsersService(
        userRepoMock as never,
        {} as never,
        dataSource as never,
        {} as never,
        auditSvc as never,
        tenantRepoMock as never,
        {} as never,
        {} as never,
        mailServiceMock as never,
      );
    });

    it('sets status to INACTIVE and records deactivatedAt', async () => {
      await service.deactivate(tenantId, userId);

      expect(managerMock.save).toHaveBeenCalledWith(
        User,
        expect.objectContaining({ status: UserStatus.INACTIVE, deactivatedAt: expect.any(Date) }),
      );
    });

    it('revokes access and refresh tokens inside the transaction', async () => {
      await service.deactivate(tenantId, userId);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(managerMock.update).toHaveBeenCalledWith(
        AccessToken,
        { tenantId, userId },
        { revoked: true },
      );
      expect(managerMock.update).toHaveBeenCalledWith(
        RefreshToken,
        { tenantId, userId },
        { revoked: true },
      );
    });

    it('records USER_DEACTIVATED audit event after the transaction commits', async () => {
      await service.deactivate(tenantId, userId, { actorId: 'admin-1' });

      expect(auditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          action: AuditAction.USER_DEACTIVATED,
          targetType: 'user',
          targetId: userId,
          actorId: 'admin-1',
        }),
      );
      const transactionOrder = dataSource.transaction.mock.invocationCallOrder[0];
      const auditOrder = auditSvc.record.mock.invocationCallOrder[0];
      expect(transactionOrder).toBeLessThan(auditOrder);
    });

    it('does not send a deactivation email when emailVerificationRequired is false', async () => {
      await service.deactivate(tenantId, userId);
      expect(mailServiceMock.sendAccountDeactivatedEmail).not.toHaveBeenCalled();
    });

    it('sends a deactivation email when the tenant requires email verification', async () => {
      tenantRepoMock.findOne.mockResolvedValue({
        id: tenantId,
        name: 'ACME',
        settings: {
          emailVerificationRequired: true,
          mailFrom: 'no-reply@acme.test',
          mailDevRedirectTo: null,
        },
      });

      await service.deactivate(tenantId, userId);

      expect(mailServiceMock.sendAccountDeactivatedEmail).toHaveBeenCalledWith({
        to: 'lee@example.com',
        serviceName: 'ACME',
        from: 'no-reply@acme.test',
        devRedirectTo: null,
      });
    });

    it('does not throw when the deactivation email fails to send (best-effort)', async () => {
      tenantRepoMock.findOne.mockResolvedValue({
        id: tenantId,
        name: 'ACME',
        settings: { emailVerificationRequired: true, mailFrom: null, mailDevRedirectTo: null },
      });
      mailServiceMock.sendAccountDeactivatedEmail.mockRejectedValue(new Error('smtp down'));

      await expect(service.deactivate(tenantId, userId)).resolves.toBeUndefined();
    });

    it('does not throw when the tenant lookup for mail-gating fails (best-effort)', async () => {
      // 트랜잭션 커밋·감사 기록이 끝난 뒤 발송 여부를 가리는 테넌트 조회가 실패해도
      // deactivate() 자체는 성공해야 한다(재시도로 deactivatedAt이 갱신되는 것을 방지).
      tenantRepoMock.findOne.mockRejectedValue(new Error('db timeout'));

      await expect(service.deactivate(tenantId, userId)).resolves.toBeUndefined();
      expect(auditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.USER_DEACTIVATED }),
      );
      expect(mailServiceMock.sendAccountDeactivatedEmail).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when user does not exist', async () => {
      userRepoMock.findOne.mockResolvedValue(null);

      await expect(service.deactivate(tenantId, userId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
