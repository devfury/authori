import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createPrivateKey, generateKeyPairSync, randomUUID } from 'crypto';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import {
  AccessToken,
  ClientType,
  KeyAlgorithm,
  KeyStatus,
  OAuthClient,
  SigningKey,
  Tenant,
  User,
  UserStatus,
} from '../src/database/entities';

describe('/t/:slug/oauth/verify (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tenantId: string;
  let tenantSlug: string;
  let otherTenantId: string;
  let otherTenantSlug: string;
  let clientId: string;
  let userId: string;
  let privateKeyPem: string;

  const signToken = (payload: Record<string, unknown>) =>
    sign(payload, createPrivateKey(privateKeyPem), {
      algorithm: 'RS256',
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    dataSource = moduleRef.get(DataSource);
    tenantSlug = `verify-${randomUUID()}`;
    otherTenantSlug = `verify-other-${randomUUID()}`;

    const [tenant, otherTenant] = await dataSource.getRepository(Tenant).save([
      { slug: tenantSlug, name: 'Verify Tenant' },
      { slug: otherTenantSlug, name: 'Verify Other Tenant' },
    ]);
    tenantId = tenant.id;
    otherTenantId = otherTenant.id;

    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    privateKeyPem = privateKey;

    await dataSource
      .getRepository(SigningKey)
      .createQueryBuilder()
      .update(SigningKey)
      .set({ status: KeyStatus.RETIRED, retiredAt: new Date() })
      .where('tenant_id IS NULL')
      .andWhere('status = :status', { status: KeyStatus.ACTIVE })
      .execute();

    await dataSource.getRepository(SigningKey).save({
      tenantId: null,
      kid: randomUUID(),
      publicKey,
      privateKey,
      status: KeyStatus.ACTIVE,
      algorithm: KeyAlgorithm.RS256,
    });

    clientId = `verify-client-${randomUUID()}`;
    await dataSource.getRepository(OAuthClient).save({
      tenantId,
      clientId,
      clientSecretHash: 'hash',
      name: 'Verify client',
      type: ClientType.CONFIDENTIAL,
      status: 'ACTIVE',
      allowedScopes: ['openid', 'email', 'users:read', 'rbac:read'],
      allowedGrants: ['authorization_code', 'client_credentials'],
    });

    const savedUser = await dataSource.getRepository(User).save({
      tenantId,
      email: `verify-${randomUUID()}@example.com`,
      passwordHash: 'x',
      status: UserStatus.ACTIVE,
    });
    userId = savedUser.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const storeToken = async (
    jti: string,
    scopes: string[],
    options: {
      tenantId?: string;
      userId?: string | null;
      revoked?: boolean;
      expiresAt?: Date;
    } = {},
  ) => {
    await dataSource.getRepository(AccessToken).save({
      tenantId: options.tenantId ?? tenantId,
      jti,
      userId: options.userId ?? null,
      clientId,
      scopes,
      revoked: options.revoked ?? false,
      expiresAt: options.expiresAt ?? new Date(Date.now() + 60_000),
    });
  };

  it('verifies a client_credentials token and returns subjectType=client', async () => {
    const jti = `verify-client-${randomUUID()}`;
    const scopes = ['users:read', 'rbac:read'];
    await storeToken(jti, scopes);
    const token = signToken({
      sub: clientId,
      client_id: clientId,
      tenant_id: tenantId,
      jti,
      scope: scopes.join(' '),
    });

    const res = await request(app.getHttpServer())
      .post(`/t/${tenantSlug}/oauth/verify`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toMatchObject({
      active: true,
      subjectType: 'client',
      sub: clientId,
      clientId,
      tenantId,
      scope: scopes.join(' '),
      scopes,
      jti,
    });
    expect(typeof res.body.expiresAt).toBe('string');
  });

  it('verifies an authorization_code token and returns subjectType=user', async () => {
    const jti = `verify-user-${randomUUID()}`;
    const scopes = ['openid', 'email'];
    await storeToken(jti, scopes, { userId });
    const token = signToken({
      sub: userId,
      client_id: clientId,
      tenant_id: tenantId,
      jti,
      scope: scopes.join(' '),
      roles: ['member'],
      permissions: ['profile:read'],
    });

    const res = await request(app.getHttpServer())
      .post(`/t/${tenantSlug}/oauth/verify`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toMatchObject({
      active: true,
      subjectType: 'user',
      sub: userId,
      clientId,
      tenantId,
      scope: scopes.join(' '),
      scopes,
      jti,
      roles: ['member'],
      permissions: ['profile:read'],
    });
  });

  it('rejects token from another tenant', async () => {
    const jti = `verify-other-${randomUUID()}`;
    const scopes = ['users:read'];
    await storeToken(jti, scopes, { tenantId: otherTenantId });
    const token = signToken({
      sub: clientId,
      client_id: clientId,
      tenant_id: otherTenantId,
      jti,
      scope: scopes.join(' '),
    });

    const res = await request(app.getHttpServer())
      .post(`/t/${tenantSlug}/oauth/verify`)
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    expect(res.body.message).toBe('tenant_mismatch');
  });

  it('rejects revoked access token', async () => {
    const jti = `verify-revoked-${randomUUID()}`;
    const scopes = ['users:read'];
    await storeToken(jti, scopes, { revoked: true });
    const token = signToken({
      sub: clientId,
      client_id: clientId,
      tenant_id: tenantId,
      jti,
      scope: scopes.join(' '),
    });

    const res = await request(app.getHttpServer())
      .post(`/t/${tenantSlug}/oauth/verify`)
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    expect(res.body.message).toBe('token_revoked');
  });

  it('verifies via GET with Authorization header', async () => {
    const jti = `verify-get-${randomUUID()}`;
    const scopes = ['users:read'];
    await storeToken(jti, scopes);
    const token = signToken({
      sub: clientId,
      client_id: clientId,
      tenant_id: tenantId,
      jti,
      scope: scopes.join(' '),
    });

    const res = await request(app.getHttpServer())
      .get(`/t/${tenantSlug}/oauth/verify`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toMatchObject({
      active: true,
      subjectType: 'client',
      sub: clientId,
      clientId,
      tenantId,
      jti,
    });
  });

  it('rejects GET without Authorization header', async () => {
    await request(app.getHttpServer()).get(`/t/${tenantSlug}/oauth/verify`).expect(401);
  });
});
