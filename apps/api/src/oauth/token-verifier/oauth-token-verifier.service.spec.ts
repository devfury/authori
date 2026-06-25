import { UnauthorizedException } from '@nestjs/common';
import { generateKeyPairSync } from 'crypto';
import { sign } from 'jsonwebtoken';
import { OAuthTokenVerifierService } from './oauth-token-verifier.service';

describe('OAuthTokenVerifierService', () => {
  const tenantId = 'tenant-1';
  const clientId = 'client-1';
  const jti = 'token-jti';
  let privateKeyPem: string;
  let publicKeyPem: string;
  let service: OAuthTokenVerifierService;
  let accessTokenRepo: {
    findOne: jest.Mock;
  };

  beforeEach(() => {
    const keyPair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    privateKeyPem = keyPair.privateKey;
    publicKeyPem = keyPair.publicKey;

    accessTokenRepo = { findOne: jest.fn() };
    service = new OAuthTokenVerifierService(
      { getActiveKey: jest.fn().mockResolvedValue({ publicKeyPem }) } as any,
      accessTokenRepo as any,
    );
  });

  function token(payload: Record<string, unknown>) {
    return sign(payload, privateKeyPem, {
      algorithm: 'RS256',
      expiresIn: 3600,
      issuer: 'https://auth.example.com/t/acme',
      audience: clientId,
    });
  }

  it('verifies a client_credentials token as subjectType=client', async () => {
    const rawToken = token({
      sub: clientId,
      client_id: clientId,
      tenant_id: tenantId,
      scope: 'users:read rbac:read',
      jti,
    });
    const expiresAt = new Date(Date.now() + 3600_000);
    accessTokenRepo.findOne.mockResolvedValue({
      tenantId,
      clientId,
      userId: null,
      jti,
      scopes: ['users:read', 'rbac:read'],
      revoked: false,
      expiresAt,
    });

    await expect(service.verifyBearer(tenantId, `Bearer ${rawToken}`)).resolves.toEqual({
      active: true,
      subjectType: 'client',
      sub: clientId,
      clientId,
      tenantId,
      scope: 'users:read rbac:read',
      scopes: ['users:read', 'rbac:read'],
      jti,
      expiresAt: expiresAt.toISOString(),
      roles: undefined,
      permissions: undefined,
    });
  });

  it('verifies an authorization_code token as subjectType=user', async () => {
    const rawToken = token({
      sub: 'user-1',
      client_id: clientId,
      tenant_id: tenantId,
      scope: 'openid email',
      roles: ['member'],
      permissions: ['profile:read'],
      jti,
    });
    const expiresAt = new Date(Date.now() + 3600_000);
    accessTokenRepo.findOne.mockResolvedValue({
      tenantId,
      clientId,
      userId: 'user-1',
      jti,
      scopes: ['openid', 'email'],
      revoked: false,
      expiresAt,
    });

    await expect(service.verifyBearer(tenantId, `Bearer ${rawToken}`)).resolves.toMatchObject({
      active: true,
      subjectType: 'user',
      sub: 'user-1',
      clientId,
      tenantId,
      scopes: ['openid', 'email'],
      roles: ['member'],
      permissions: ['profile:read'],
    });
  });

  it('rejects missing bearer header', async () => {
    await expect(service.verifyBearer(tenantId, undefined)).rejects.toThrow(
      new UnauthorizedException('Bearer token required'),
    );
  });

  it('rejects tenant mismatch', async () => {
    const rawToken = token({
      sub: clientId,
      client_id: clientId,
      tenant_id: 'other-tenant',
      scope: 'users:read',
      jti,
    });

    await expect(service.verifyBearer(tenantId, `Bearer ${rawToken}`)).rejects.toThrow(
      new UnauthorizedException('tenant_mismatch'),
    );
  });

  it('rejects revoked token records', async () => {
    const rawToken = token({
      sub: clientId,
      client_id: clientId,
      tenant_id: tenantId,
      scope: 'users:read',
      jti,
    });
    accessTokenRepo.findOne.mockResolvedValue({
      tenantId,
      clientId,
      userId: null,
      jti,
      scopes: ['users:read'],
      revoked: true,
      expiresAt: new Date(Date.now() + 3600_000),
    });

    await expect(service.verifyBearer(tenantId, `Bearer ${rawToken}`)).rejects.toThrow(
      new UnauthorizedException('token_revoked'),
    );
  });

  it('rejects expired database token records', async () => {
    const rawToken = token({
      sub: clientId,
      client_id: clientId,
      tenant_id: tenantId,
      scope: 'users:read',
      jti,
    });
    accessTokenRepo.findOne.mockResolvedValue({
      tenantId,
      clientId,
      userId: null,
      jti,
      scopes: ['users:read'],
      revoked: false,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.verifyBearer(tenantId, `Bearer ${rawToken}`)).rejects.toThrow(
      new UnauthorizedException('token_revoked'),
    );
  });
});
