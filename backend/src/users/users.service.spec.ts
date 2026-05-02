import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserStatus, AuditAction } from '../database/entities';

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

    await expect(service.findOne(tenantId, userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
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

      await expect(
        service.updateSelf(tenantId, userId, { loginId: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
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
});
