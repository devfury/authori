import { TenantsService } from './tenants.service';

describe('TenantsService — production mailDevRedirectTo strip', () => {
  const tenantId = 'tenant-1';

  function buildService(nodeEnv: 'development' | 'production') {
    const tenant = {
      id: tenantId,
      name: 'Acme',
      issuer: null,
      status: 'ACTIVE',
      settings: { mailFrom: null as string | null, mailDevRedirectTo: null as string | null },
    };

    const tenantRepo = { findOne: jest.fn().mockResolvedValue(tenant) };
    const manager = { save: jest.fn((_e: unknown, v: unknown) => v) };
    const dataSource = {
      transaction: jest.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    const config = { get: jest.fn((key: string) => (key === 'app.nodeEnv' ? nodeEnv : undefined)) };

    const service = new TenantsService(
      tenantRepo as never,
      {} as never,
      dataSource as never,
      {} as never,
      {} as never,
      config as never,
    );
    return { service, tenant };
  }

  it('production에서는 mailDevRedirectTo 저장 요청을 무시한다', async () => {
    const { service, tenant } = buildService('production');

    await service.update(tenantId, {
      settings: { mailFrom: 'Acme <no-reply@acme.com>', mailDevRedirectTo: 'dev@acme.com' },
    });

    expect(tenant.settings.mailFrom).toBe('Acme <no-reply@acme.com>');
    expect(tenant.settings.mailDevRedirectTo).toBeNull();
  });

  it('development에서는 mailDevRedirectTo를 저장한다', async () => {
    const { service, tenant } = buildService('development');

    await service.update(tenantId, {
      settings: { mailFrom: 'Acme <no-reply@acme.com>', mailDevRedirectTo: 'dev@acme.com' },
    });

    expect(tenant.settings.mailDevRedirectTo).toBe('dev@acme.com');
  });
});
