import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createPrivateKey, generateKeyPairSync, randomUUID } from 'crypto';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import {
  AccessToken,
  AuditLog,
  ClientType,
  KeyAlgorithm,
  KeyStatus,
  OAuthClient,
  SigningKey,
  Tenant,
  TenantRole,
  User,
  UserRole,
  UserStatus,
} from '../src/database/entities';

describe('M2M RBAC API (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tenantId: string;
  let tenantSlug: string;
  let otherTenantId: string;
  let otherTenantSlug: string;
  let clientId: string;
  let userId: string;
  let adminRoleId: string;
  let viewerRoleId: string;
  let otherTenantRoleId: string;
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
    tenantSlug = `m2m-${randomUUID()}`;
    otherTenantSlug = `m2m-other-${randomUUID()}`;

    const [tenant, otherTenant] = await dataSource.getRepository(Tenant).save([
      { slug: tenantSlug, name: 'M2M Tenant' },
      { slug: otherTenantSlug, name: 'Other M2M Tenant' },
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

    clientId = `m2m-client-${randomUUID()}`;
    await dataSource.getRepository(OAuthClient).save({
      tenantId,
      clientId,
      clientSecretHash: 'hash',
      name: 'M2M RBAC client',
      type: ClientType.CONFIDENTIAL,
      status: 'ACTIVE',
      allowedScopes: ['rbac:read', 'rbac:write'],
      allowedGrants: ['client_credentials'],
    });

    const savedUser = await dataSource.getRepository(User).save({
      tenantId,
      email: `m2m-${randomUUID()}@example.com`,
      passwordHash: 'x',
      status: UserStatus.ACTIVE,
    });
    userId = savedUser.id;

    const [adminRole, viewerRole, otherTenantRole] = await dataSource
      .getRepository(TenantRole)
      .save([
        {
          tenantId,
          name: `admin-${randomUUID()}`,
          displayName: 'Admin',
          description: null,
        },
        {
          tenantId,
          name: `viewer-${randomUUID()}`,
          displayName: 'Viewer',
          description: null,
        },
        {
          tenantId: otherTenantId,
          name: `other-${randomUUID()}`,
          displayName: 'Other',
          description: null,
        },
      ]);
    adminRoleId = adminRole.id;
    viewerRoleId = viewerRole.id;
    otherTenantRoleId = otherTenantRole.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const storeToken = async (
    jti: string,
    scopes: string[],
    options: { tenantId?: string; revoked?: boolean } = {},
  ) => {
    await dataSource.getRepository(AccessToken).save({
      tenantId: options.tenantId ?? tenantId,
      jti,
      userId: null,
      clientId,
      scopes,
      revoked: options.revoked ?? false,
      expiresAt: new Date(Date.now() + 60_000),
    });
  };

  const bearerToken = async (
    scopes: string[],
    options: { tenantId?: string; revoked?: boolean } = {},
  ) => {
    const jti = `m2m-${randomUUID()}`;
    const tokenTenantId = options.tenantId ?? tenantId;
    await storeToken(jti, scopes, options);
    return signToken({
      sub: clientId,
      client_id: clientId,
      tenant_id: tokenTenantId,
      jti,
      scope: scopes.join(' '),
    });
  };

  beforeEach(async () => {
    await dataSource.getRepository(UserRole).delete({ userId });
    await dataSource
      .getRepository(AuditLog)
      .createQueryBuilder()
      .delete()
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('actor_id = :clientId', { clientId })
      .execute();
  });

  it('lists tenant roles and user roles with rbac:read', async () => {
    await dataSource
      .getRepository(UserRole)
      .save({ userId, roleId: adminRoleId });
    const token = await bearerToken(['rbac:read']);

    const roles = await request(app.getHttpServer())
      .get(`/t/${tenantSlug}/api/roles`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(roles.body.map((role: { id: string }) => role.id)).toEqual([
      adminRoleId,
      viewerRoleId,
    ]);

    const userRoles = await request(app.getHttpServer())
      .get(`/t/${tenantSlug}/api/users/${userId}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(userRoles.body.map((role: { id: string }) => role.id)).toEqual([
      adminRoleId,
    ]);
  });

  it('rejects read endpoints without rbac:read', async () => {
    const token = await bearerToken(['rbac:write']);

    await request(app.getHttpServer())
      .get(`/t/${tenantSlug}/api/users/${userId}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('adds and removes a user role idempotently with rbac:write', async () => {
    const token = await bearerToken(['rbac:write']);

    await request(app.getHttpServer())
      .post(`/t/${tenantSlug}/api/users/${userId}/roles/${adminRoleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/t/${tenantSlug}/api/users/${userId}/roles/${adminRoleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(await dataSource.getRepository(UserRole).countBy({ userId })).toBe(
      1,
    );

    await request(app.getHttpServer())
      .delete(`/t/${tenantSlug}/api/users/${userId}/roles/${adminRoleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/t/${tenantSlug}/api/users/${userId}/roles/${adminRoleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(await dataSource.getRepository(UserRole).countBy({ userId })).toBe(
      0,
    );

    const auditLogs = await dataSource.getRepository(AuditLog).find({
      where: { tenantId, actorId: clientId, actorType: 'oauth_client' },
      order: { createdAt: 'ASC' },
    });
    expect(auditLogs).toHaveLength(4);
    expect(auditLogs.every((log) => log.targetType === 'user_role')).toBe(true);
  });

  it('replaces user roles with rbac:write', async () => {
    const token = await bearerToken(['rbac:write']);
    await dataSource
      .getRepository(UserRole)
      .save({ userId, roleId: adminRoleId });

    const res = await request(app.getHttpServer())
      .put(`/t/${tenantSlug}/api/users/${userId}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roleIds: [viewerRoleId] })
      .expect(200);

    expect(res.body.map((role: { id: string }) => role.id)).toEqual([
      viewerRoleId,
    ]);
  });

  it('rejects write endpoints without rbac:write', async () => {
    const token = await bearerToken(['rbac:read']);

    await request(app.getHttpServer())
      .post(`/t/${tenantSlug}/api/users/${userId}/roles/${adminRoleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('rejects tokens from another tenant', async () => {
    const token = await bearerToken(['rbac:write'], {
      tenantId: otherTenantId,
    });

    await request(app.getHttpServer())
      .post(`/t/${tenantSlug}/api/users/${userId}/roles/${adminRoleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects revoked tokens', async () => {
    const token = await bearerToken(['rbac:write'], { revoked: true });

    await request(app.getHttpServer())
      .post(`/t/${tenantSlug}/api/users/${userId}/roles/${adminRoleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects roles from another tenant', async () => {
    const token = await bearerToken(['rbac:write']);

    await request(app.getHttpServer())
      .post(`/t/${tenantSlug}/api/users/${userId}/roles/${otherTenantRoleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
