import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserStatus } from '../database/entities';

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
});
