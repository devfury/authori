import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { createPrivateKey, generateKeyPairSync, randomUUID } from 'crypto';
import { sign } from 'jsonwebtoken';
import { Repository } from 'typeorm';
import { AccessToken } from '../../database/entities';
import { KeysService } from '../../oauth/keys/keys.service';
import { OAuthAccessTokenGuard } from './oauth-access-token.guard';

describe('OAuthAccessTokenGuard', () => {
  let publicKeyPem: string;
  let privateKeyPem: string;
  let keysService: Pick<KeysService, 'getActiveKey'>;
  let accessTokenRepo: Pick<Repository<AccessToken>, 'findOne'>;
  let guard: OAuthAccessTokenGuard;

  const tenantId = randomUUID();
  const clientId = `client-${randomUUID()}`;

  const createContext = (
    headers: Record<string, string | undefined>,
    requestTenantId: string | undefined = tenantId,
  ) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          tenantContext: requestTenantId
            ? { tenantId: requestTenantId, tenantSlug: 'acme' }
            : undefined,
        }),
      }),
    }) as ExecutionContext;

  const signToken = (payload: Record<string, unknown>) =>
    sign(payload, createPrivateKey(privateKeyPem), {
      algorithm: 'RS256',
    });

  beforeEach(() => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    publicKeyPem = publicKey;
    privateKeyPem = privateKey;

    keysService = {
      getActiveKey: jest.fn().mockResolvedValue({
        kid: randomUUID(),
        privateKeyPem,
        publicKeyPem,
        algorithm: 'RS256',
      }),
    };
    accessTokenRepo = {
      findOne: jest.fn(),
    };
    guard = new OAuthAccessTokenGuard(
      keysService as KeysService,
      accessTokenRepo as Repository<AccessToken>,
    );
  });

  it('rejects requests without a bearer token', async () => {
    await expect(guard.canActivate(createContext({}))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects tokens whose tenant_id does not match the request tenant', async () => {
    const token = signToken({
      sub: clientId,
      tenant_id: randomUUID(),
      jti: randomUUID(),
      scope: 'rbac:write',
    });

    await expect(
      guard.canActivate(
        createContext({ authorization: `Bearer ${token}` }, tenantId),
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(accessTokenRepo.findOne).not.toHaveBeenCalled();
  });

  it('rejects revoked token records', async () => {
    const jti = randomUUID();
    const token = signToken({
      sub: clientId,
      tenant_id: tenantId,
      jti,
      scope: 'rbac:write',
    });
    jest.mocked(accessTokenRepo.findOne).mockResolvedValue({
      tenantId,
      jti,
      revoked: true,
      expiresAt: new Date(Date.now() + 60_000),
    } as AccessToken);

    await expect(
      guard.canActivate(createContext({ authorization: `Bearer ${token}` })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('attaches verified payload when the token is active', async () => {
    const jti = randomUUID();
    const token = signToken({
      sub: clientId,
      client_id: clientId,
      tenant_id: tenantId,
      jti,
      scope: 'rbac:read rbac:write',
    });
    const request = {
      headers: { authorization: `Bearer ${token}` },
      tenantContext: { tenantId, tenantSlug: 'acme' },
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
    jest.mocked(accessTokenRepo.findOne).mockResolvedValue({
      tenantId,
      jti,
      revoked: false,
      expiresAt: new Date(Date.now() + 60_000),
    } as AccessToken);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.accessToken).toMatchObject({
      sub: clientId,
      client_id: clientId,
      tenant_id: tenantId,
      jti,
      scope: 'rbac:read rbac:write',
    });
  });
});
