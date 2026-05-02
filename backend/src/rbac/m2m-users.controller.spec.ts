import { CanActivate } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { M2mUsersController } from './m2m-users.controller';
import { OAuthAccessTokenGuard } from '../common/guards/oauth-access-token.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { UsersService } from '../users/users.service';
import { UserStatus } from '../database/entities';

const passThroughGuard: CanActivate = { canActivate: () => true };

describe('M2mUsersController', () => {
  let controller: M2mUsersController;
  let usersService: {
    findAll: jest.Mock;
    activate: jest.Mock;
    deactivate: jest.Mock;
    lock: jest.Mock;
    unlock: jest.Mock;
  };

  const tenant = { tenantId: 'tenant-1', tenantSlug: 'acme' };
  const userId = 'user-1';
  const mockReq = {
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test-agent' },
    accessToken: { sub: 'client-1' },
    requestId: 'req-abc',
  } as any;

  beforeEach(async () => {
    usersService = {
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
      activate: jest.fn().mockResolvedValue(undefined),
      deactivate: jest.fn().mockResolvedValue(undefined),
      lock: jest.fn().mockResolvedValue(undefined),
      unlock: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [M2mUsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    })
      .overrideGuard(OAuthAccessTokenGuard).useValue(passThroughGuard)
      .overrideGuard(ScopeGuard).useValue(passThroughGuard)
      .compile();

    controller = module.get(M2mUsersController);
  });

  describe('listUsers', () => {
    it('passes parsed page and limit to usersService.findAll', async () => {
      await controller.listUsers(tenant as any, '2', '10', 'alice', UserStatus.ACTIVE);
      expect(usersService.findAll).toHaveBeenCalledWith('tenant-1', {
        page: 2,
        limit: 10,
        search: 'alice',
        status: UserStatus.ACTIVE,
      });
    });

    it('passes undefined for omitted query params', async () => {
      await controller.listUsers(tenant as any, undefined, undefined, undefined, undefined);
      expect(usersService.findAll).toHaveBeenCalledWith('tenant-1', {
        page: undefined,
        limit: undefined,
        search: undefined,
        status: undefined,
      });
    });
  });

  describe('activateUser', () => {
    it('calls usersService.activate with tenantId, userId, and oauth_client ctx', async () => {
      await controller.activateUser(tenant as any, userId, mockReq);
      expect(usersService.activate).toHaveBeenCalledWith(
        'tenant-1',
        userId,
        expect.objectContaining({ actorId: 'client-1', actorType: 'oauth_client' }),
      );
    });
  });

  describe('deactivateUser', () => {
    it('calls usersService.deactivate with tenantId, userId, and oauth_client ctx', async () => {
      await controller.deactivateUser(tenant as any, userId, mockReq);
      expect(usersService.deactivate).toHaveBeenCalledWith(
        'tenant-1',
        userId,
        expect.objectContaining({ actorId: 'client-1', actorType: 'oauth_client' }),
      );
    });
  });

  describe('lockUser', () => {
    it('calls usersService.lock with tenantId, userId, and oauth_client ctx', async () => {
      await controller.lockUser(tenant as any, userId, mockReq);
      expect(usersService.lock).toHaveBeenCalledWith(
        'tenant-1',
        userId,
        expect.objectContaining({ actorId: 'client-1', actorType: 'oauth_client' }),
      );
    });
  });

  describe('unlockUser', () => {
    it('calls usersService.unlock with tenantId, userId, and oauth_client ctx', async () => {
      await controller.unlockUser(tenant as any, userId, mockReq);
      expect(usersService.unlock).toHaveBeenCalledWith(
        'tenant-1',
        userId,
        expect.objectContaining({ actorId: 'client-1', actorType: 'oauth_client' }),
      );
    });
  });
});
