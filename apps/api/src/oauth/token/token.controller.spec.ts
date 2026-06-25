import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { OAuthTokenVerifierService } from '../token-verifier/oauth-token-verifier.service';
import { TokenController } from './token.controller';
import { TokenService } from './token.service';

describe('TokenController', () => {
  const verifyResponse = {
    active: true,
    subjectType: 'client' as const,
    sub: 'client-1',
    clientId: 'client-1',
    tenantId: 'tenant-1',
    scope: 'users:read',
    scopes: ['users:read'],
    jti: 'jti-1',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };

  const buildController = async (verifier: { verifyBearer: jest.Mock }) => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TokenController],
      providers: [
        { provide: TokenService, useValue: { issue: jest.fn() } },
        { provide: OAuthTokenVerifierService, useValue: verifier },
      ],
    }).compile();
    return moduleRef.get(TokenController);
  };

  it('responds to POST /token with 200 OK per RFC 6749 §5.1 (not NestJS default 201)', () => {
    const statusCode = Reflect.getMetadata(HTTP_CODE_METADATA, TokenController.prototype.issue);
    expect(statusCode).toBe(HttpStatus.OK);
  });

  it('delegates POST /verify to OAuthTokenVerifierService', async () => {
    const verifier = { verifyBearer: jest.fn().mockResolvedValue(verifyResponse) };
    const controller = await buildController(verifier);
    await expect(
      controller.verify({ tenantId: 'tenant-1', tenantSlug: 'acme' }, {
        headers: { authorization: 'Bearer token' },
      } as any),
    ).resolves.toBe(verifyResponse);
    expect(verifier.verifyBearer).toHaveBeenCalledWith('tenant-1', 'Bearer token');
  });

  it('delegates GET /verify to OAuthTokenVerifierService', async () => {
    const verifier = { verifyBearer: jest.fn().mockResolvedValue(verifyResponse) };
    const controller = await buildController(verifier);
    await expect(
      controller.verifyGet({ tenantId: 'tenant-1', tenantSlug: 'acme' }, {
        headers: { authorization: 'Bearer token' },
      } as any),
    ).resolves.toBe(verifyResponse);
    expect(verifier.verifyBearer).toHaveBeenCalledWith('tenant-1', 'Bearer token');
  });
});
