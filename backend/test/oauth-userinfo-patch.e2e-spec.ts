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
  UserProfile,
  UserStatus,
} from '../src/database/entities';

describe('PATCH /t/:slug/oauth/userinfo (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tenantSlug: string;
  let userId: string;
  let tenantId: string;
  let clientId: string;
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
    tenantSlug = `acme-${randomUUID()}`;

    const tenant = await dataSource
      .getRepository(Tenant)
      .save({ slug: tenantSlug, name: 'Acme' });
    tenantId = tenant.id;

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

    clientId = `client-${randomUUID()}`;
    await dataSource.getRepository(OAuthClient).save({
      tenantId,
      clientId,
      clientSecretHash: null,
      name: 'Self-service test client',
      type: ClientType.PUBLIC,
      status: 'ACTIVE',
      allowedScopes: ['openid', 'profile', 'profile:write'],
      allowedGrants: ['authorization_code'],
    });

    const saved = await dataSource.getRepository(User).save({
      tenantId,
      email: 'jin@example.com',
      passwordHash: 'x',
      status: UserStatus.ACTIVE,
    });
    userId = saved.id;

    await dataSource.getRepository(UserProfile).save({
      tenantId,
      userId,
      profileJsonb: { nickname: 'Jin' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const storeToken = async (jti: string, scopes: string[]) => {
    await dataSource.getRepository(AccessToken).save({
      tenantId,
      jti,
      userId,
      clientId,
      scopes,
      revoked: false,
      expiresAt: new Date(Date.now() + 60_000),
    });
  };

  it('rejects requests without Bearer token', async () => {
    await request(app.getHttpServer())
      .patch(`/t/${tenantSlug}/oauth/userinfo`)
      .send({ profile: { nickname: 'X' } })
      .expect(401);
  });

  it('rejects tokens missing profile:write scope', async () => {
    const jti = `jti-readonly-${randomUUID()}`;
    const scopes = ['openid', 'profile'];
    await storeToken(jti, scopes);
    const token = signToken({ sub: userId, jti, scope: scopes.join(' ') });

    await request(app.getHttpServer())
      .patch(`/t/${tenantSlug}/oauth/userinfo`)
      .set('Authorization', `Bearer ${token}`)
      .send({ profile: { nickname: 'X' } })
      .expect(403);
  });

  it('merges profile fields when profile:write is granted', async () => {
    const jti = `jti-write-${randomUUID()}`;
    const scopes = ['openid', 'profile', 'profile:write'];
    await storeToken(jti, scopes);
    const token = signToken({ sub: userId, jti, scope: scopes.join(' ') });

    const res = await request(app.getHttpServer())
      .patch(`/t/${tenantSlug}/oauth/userinfo`)
      .set('Authorization', `Bearer ${token}`)
      .send({ profile: { nickname: 'Johnny', city: 'Seoul' } })
      .expect(200);

    expect(res.body.profile).toEqual({
      nickname: 'Johnny',
      city: 'Seoul',
    });
  });

  it('ignores status field from self-service payload (DTO whitelist)', async () => {
    const jti = `jti-status-${randomUUID()}`;
    const scopes = ['profile:write'];
    await storeToken(jti, scopes);
    const token = signToken({ sub: userId, jti, scope: scopes.join(' ') });

    const res = await request(app.getHttpServer())
      .patch(`/t/${tenantSlug}/oauth/userinfo`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'LOCKED', loginId: 'johnny' })
      .expect(200);

    const user = await dataSource
      .getRepository(User)
      .findOne({ where: { id: userId } });
    expect(user?.status).toBe(UserStatus.ACTIVE);
    expect(res.body.loginId).toBe('johnny');
  });
});
