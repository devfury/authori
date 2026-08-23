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
  TenantScope,
  User,
  UserProfile,
  UserStatus,
} from '../src/database/entities';

describe('GET·PATCH /t/:slug/oauth/userinfo (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tenantSlug: string;
  let userId: string;
  let tenantId: string;
  let clientId: string;
  let privateKeyPem: string;

  const signToken = (payload: Record<string, unknown>) =>
    sign(
      { tenant_id: tenantId, client_id: clientId, ...payload },
      createPrivateKey(privateKeyPem),
      {
        algorithm: 'RS256',
      },
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    dataSource = moduleRef.get(DataSource);
    tenantSlug = `acme-${randomUUID()}`;

    const tenant = await dataSource.getRepository(Tenant).save({ slug: tenantSlug, name: 'Acme' });
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

    await dataSource.getRepository(TenantScope).save([
      {
        tenantId,
        name: 'openid',
        displayName: 'OpenID',
        description: '사용자를 인증하고 OpenID Connect 식별자를 발행합니다.',
        isDefault: true,
      },
      {
        tenantId,
        name: 'profile',
        displayName: 'Profile',
        description: '사용자의 프로필 정보를 조회합니다.',
        isDefault: true,
      },
      {
        tenantId,
        name: 'profile:write',
        displayName: 'Profile (Write)',
        description: '인증된 사용자 프로필을 업데이트합니다.',
        isDefault: false,
      },
    ]);

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

  /** supertest의 res.body는 any이므로 클레임 단정 전에 타입을 좁힌다. */
  const claims = (res: { body: unknown }): Record<string, unknown> =>
    res.body as Record<string, unknown>;

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

    await request(app.getHttpServer()).get(`/t/${tenantSlug}/oauth/userinfo`).expect(401);
  });

  it('GET은 scope가 없으면 sub와 tenant_id만 반환한다', async () => {
    const jti = `jti-get-noscope-${randomUUID()}`;
    await storeToken(jti, []);
    const token = signToken({ sub: userId, jti });

    const res = await request(app.getHttpServer())
      .get(`/t/${tenantSlug}/oauth/userinfo`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(claims(res)).toEqual({ sub: userId, tenant_id: tenantId });
  });

  it('GET은 profile scope에서 프로필 필드를 최상위로 평탄화한다', async () => {
    const jti = `jti-get-profile-${randomUUID()}`;
    const scopes = ['openid', 'profile'];
    await storeToken(jti, scopes);
    const token = signToken({ sub: userId, jti, scope: scopes.join(' ') });

    const res = await request(app.getHttpServer())
      .get(`/t/${tenantSlug}/oauth/userinfo`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(claims(res).nickname).toBe('Jin');
    expect(claims(res)).not.toHaveProperty('profile');
  });

  it('GET은 로그인 ID를 preferred_username 표준 클레임으로 반환한다', async () => {
    await dataSource.getRepository(User).update({ id: userId }, { loginId: 'jin-login' });

    const jti = `jti-get-username-${randomUUID()}`;
    const scopes = ['openid', 'profile'];
    await storeToken(jti, scopes);
    const token = signToken({ sub: userId, jti, scope: scopes.join(' ') });

    const res = await request(app.getHttpServer())
      .get(`/t/${tenantSlug}/oauth/userinfo`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(claims(res).preferred_username).toBe('jin-login');
    expect(claims(res)).not.toHaveProperty('loginId');
  });

  it('GET은 프로필에 심어둔 예약 클레임이 인증 정보를 덮어쓰지 못하게 한다', async () => {
    const profileRepo = dataSource.getRepository(UserProfile);
    await profileRepo.update(
      { userId },
      {
        profileJsonb: {
          nickname: 'Jin',
          sub: 'attacker',
          email: 'victim@corp.com',
          email_verified: true,
          preferred_username: 'admin',
        },
      },
    );

    const jti = `jti-get-reserved-${randomUUID()}`;
    const scopes = ['openid', 'email', 'profile'];
    await storeToken(jti, scopes);
    const token = signToken({ sub: userId, jti, scope: scopes.join(' ') });

    const res = await request(app.getHttpServer())
      .get(`/t/${tenantSlug}/oauth/userinfo`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(claims(res).sub).toBe(userId);
    expect(claims(res).email).toBe('jin@example.com');
    expect(claims(res).preferred_username).toBe('jin-login');
    expect(claims(res).nickname).toBe('Jin');

    await profileRepo.update({ userId }, { profileJsonb: { nickname: 'Jin' } });
  });

  it('returns scope display names and descriptions in login config', async () => {
    const res = await request(app.getHttpServer())
      .get(`/t/${tenantSlug}/oauth/login-config`)
      .query({ client_id: clientId })
      .expect(200);

    expect(res.body.scopes).toEqual([
      {
        name: 'openid',
        displayName: 'OpenID',
        description: '사용자를 인증하고 OpenID Connect 식별자를 발행합니다.',
      },
      {
        name: 'profile',
        displayName: 'Profile',
        description: '사용자의 프로필 정보를 조회합니다.',
      },
      {
        name: 'profile:write',
        displayName: 'Profile (Write)',
        description: '인증된 사용자 프로필을 업데이트합니다.',
      },
    ]);
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

    expect(claims(res)).toMatchObject({
      sub: userId,
      tenant_id: tenantId,
      nickname: 'Johnny',
      city: 'Seoul',
    });
    expect(claims(res)).not.toHaveProperty('profile');
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

    const user = await dataSource.getRepository(User).findOne({ where: { id: userId } });
    expect(user?.status).toBe(UserStatus.ACTIVE);
    expect(claims(res).preferred_username).toBe('johnny');
    expect(claims(res)).not.toHaveProperty('loginId');
  });

  it('GET과 PATCH가 동일한 클레임 키 집합을 반환한다', async () => {
    const jti = `jti-parity-${randomUUID()}`;
    const scopes = ['openid', 'email', 'profile', 'profile:write'];
    await storeToken(jti, scopes);
    const token = signToken({ sub: userId, jti, scope: scopes.join(' ') });

    const getRes = await request(app.getHttpServer())
      .get(`/t/${tenantSlug}/oauth/userinfo`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const patchRes = await request(app.getHttpServer())
      .patch(`/t/${tenantSlug}/oauth/userinfo`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);

    expect(Object.keys(claims(patchRes)).sort()).toEqual(Object.keys(claims(getRes)).sort());
  });
});
