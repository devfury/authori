import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import {
  Tenant,
  TenantRole,
  TenantSettings,
  User,
  UserRole,
  UserStatus,
} from '../src/database/entities';

jest.setTimeout(30_000);

describe('Registration defaults (e2e)', () => {
  let app: INestApplication | undefined;
  let dataSource: DataSource | undefined;
  const tenantIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    dataSource = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    for (const tenantId of tenantIds) {
      if (!dataSource) continue;
      await dataSource.getRepository(TenantSettings).delete({ tenantId });
      await dataSource.getRepository(Tenant).delete({ id: tenantId });
    }
    await app?.close();
  });

  function getDataSource(): DataSource {
    if (!dataSource) throw new Error('data_source_not_initialized');
    return dataSource;
  }

  async function createTenant(options: {
    allowRegistration: boolean;
    autoActivateRegistration: boolean;
  }) {
    const slug = `reg-${randomUUID()}`;
    const tenant = await getDataSource().getRepository(Tenant).save({
      slug,
      name: `Registration ${slug}`,
    });
    tenantIds.push(tenant.id);

    await getDataSource().getRepository(TenantSettings).save({
      tenantId: tenant.id,
      allowRegistration: options.allowRegistration,
      autoActivateRegistration: options.autoActivateRegistration,
    });

    return { tenant, slug };
  }

  function register(slug: string, email: string) {
    if (!app) throw new Error('app_not_initialized');
    return request(app.getHttpServer())
      .post(`/t/${slug}/oauth/register`)
      .send({
        email,
        password: 'password123',
        profile: {},
      });
  }

  it('creates an active user and assigns all default roles when auto activation is enabled', async () => {
    const { tenant, slug } = await createTenant({
      allowRegistration: true,
      autoActivateRegistration: true,
    });
    const ds = getDataSource();
    const [memberRole, viewerRole] = await ds.getRepository(TenantRole).save([
      {
        tenantId: tenant.id,
        name: `member-${randomUUID()}`,
        displayName: 'Member',
        description: null,
        isDefault: true,
      },
      {
        tenantId: tenant.id,
        name: `viewer-${randomUUID()}`,
        displayName: 'Viewer',
        description: null,
        isDefault: true,
      },
      {
        tenantId: tenant.id,
        name: `manager-${randomUUID()}`,
        displayName: 'Manager',
        description: null,
        isDefault: false,
      },
    ]);
    const email = `active-${randomUUID()}@example.com`;

    await register(slug, email).expect(201);

    const createdUser = await ds.getRepository(User).findOneByOrFail({
      tenantId: tenant.id,
      email,
    });
    expect(createdUser.status).toBe(UserStatus.ACTIVE);

    const assignedRoles = await ds
      .getRepository(TenantRole)
      .createQueryBuilder('role')
      .innerJoin(UserRole, 'userRole', '"userRole"."role_id" = "role"."id"')
      .where('"userRole"."user_id" = :userId', { userId: createdUser.id })
      .orderBy('role.name', 'ASC')
      .getMany();
    expect(assignedRoles.map((role) => role.id).sort()).toEqual(
      [memberRole.id, viewerRole.id].sort(),
    );
  });

  it('keeps registered users inactive when auto activation is disabled', async () => {
    const { tenant, slug } = await createTenant({
      allowRegistration: true,
      autoActivateRegistration: false,
    });
    const email = `inactive-${randomUUID()}@example.com`;

    await register(slug, email).expect(201);

    const createdUser = await getDataSource().getRepository(User).findOneByOrFail({
      tenantId: tenant.id,
      email,
    });
    expect(createdUser.status).toBe(UserStatus.INACTIVE);
  });

  it('allows registration without assigning roles when no default roles exist', async () => {
    const { tenant, slug } = await createTenant({
      allowRegistration: true,
      autoActivateRegistration: true,
    });
    const ds = getDataSource();
    await ds.getRepository(TenantRole).save({
      tenantId: tenant.id,
      name: `manual-${randomUUID()}`,
      displayName: 'Manual',
      description: null,
      isDefault: false,
    });
    const email = `norole-${randomUUID()}@example.com`;

    await register(slug, email).expect(201);

    const createdUser = await ds.getRepository(User).findOneByOrFail({
      tenantId: tenant.id,
      email,
    });
    expect(await ds.getRepository(UserRole).countBy({
      userId: createdUser.id,
    })).toBe(0);
  });

  it('rejects public registration when registration is disabled', async () => {
    const { slug } = await createTenant({
      allowRegistration: false,
      autoActivateRegistration: true,
    });

    await register(slug, `disabled-${randomUUID()}@example.com`).expect(403);
  });
});
