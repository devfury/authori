import { Test } from '@nestjs/testing';
import { OAuthTokenVerifierService } from '../token-verifier/oauth-token-verifier.service';
import { TokenController } from './token.controller';
import { TokenService } from './token.service';

describe('TokenController', () => {
  it('delegates POST /verify to OAuthTokenVerifierService', async () => {
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
    const verifier = {
      verifyBearer: jest.fn().mockResolvedValue(verifyResponse),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [TokenController],
      providers: [
        { provide: TokenService, useValue: { issue: jest.fn() } },
        { provide: OAuthTokenVerifierService, useValue: verifier },
      ],
    }).compile();

    const controller = moduleRef.get(TokenController);
    await expect(
      controller.verify({ tenantId: 'tenant-1', tenantSlug: 'acme' }, {
        headers: { authorization: 'Bearer token' },
      } as any),
    ).resolves.toBe(verifyResponse);
    expect(verifier.verifyBearer).toHaveBeenCalledWith('tenant-1', 'Bearer token');
  });
});
