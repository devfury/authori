import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { OAuthTokenVerifierService } from '../../oauth/token-verifier/oauth-token-verifier.service';
import { OAuthAccessTokenGuard } from './oauth-access-token.guard';

describe('OAuthAccessTokenGuard', () => {
  let verifier: Pick<OAuthTokenVerifierService, 'verifyBearer'>;
  let guard: OAuthAccessTokenGuard;

  const createContext = (request: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as ExecutionContext;

  beforeEach(() => {
    verifier = {
      verifyBearer: jest.fn().mockResolvedValue({
        active: true,
        subjectType: 'client',
        sub: 'client-1',
        clientId: 'client-1',
        tenantId: 'tenant-1',
        scope: 'rbac:read',
        scopes: ['rbac:read'],
        jti: 'jti-1',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      }),
    };
    guard = new OAuthAccessTokenGuard(verifier as OAuthTokenVerifierService);
  });

  it('rejects requests without tenant context', async () => {
    await expect(guard.canActivate(createContext({ headers: {} }))).rejects.toThrow(
      new UnauthorizedException('Tenant context is required'),
    );
  });

  it('delegates bearer verification to OAuthTokenVerifierService', async () => {
    const request = {
      headers: { authorization: 'Bearer token' },
      tenantContext: { tenantId: 'tenant-1', tenantSlug: 'acme' },
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(verifier.verifyBearer).toHaveBeenCalledWith('tenant-1', 'Bearer token');
    expect(request.accessToken).toMatchObject({
      sub: 'client-1',
      client_id: 'client-1',
      tenant_id: 'tenant-1',
      scope: 'rbac:read',
      scopes: ['rbac:read'],
      jti: 'jti-1',
    });
  });
});
