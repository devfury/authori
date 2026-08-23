import { TenantsService } from './tenants.service';
import { AuditAction } from '../database/entities';

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
      {} as never,
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

describe('TenantsService — ezAria 알림 설정·테스트 발송', () => {
  const tenantId = 'tenant-1';

  function buildService(sendResult: { sent: boolean; reason?: string } = { sent: true }) {
    const tenant = {
      id: tenantId,
      name: 'Acme',
      issuer: null,
      status: 'ACTIVE',
      settings: {
        pendingApprovalNotifyEnabled: false,
        ezariaChatRoomId: null as string | null,
      },
    };

    const tenantRepo = { findOne: jest.fn().mockResolvedValue(tenant) };
    const manager = { save: jest.fn((_e: unknown, v: unknown) => v) };
    const dataSource = {
      transaction: jest.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    const config = {
      get: jest.fn((key: string) => (key === 'app.nodeEnv' ? 'development' : undefined)),
    };
    const auditService = { record: jest.fn().mockResolvedValue(undefined) };
    const notifier = { sendTest: jest.fn().mockResolvedValue(sendResult) };

    const service = new TenantsService(
      tenantRepo as never,
      {} as never,
      dataSource as never,
      auditService as never,
      {} as never,
      config as never,
      notifier as never,
    );
    return { service, tenant, auditService, notifier };
  }

  it('알림 사용 여부와 채팅방 ID를 저장한다', async () => {
    const { service, tenant } = buildService();

    await service.update(tenantId, {
      settings: { pendingApprovalNotifyEnabled: true, ezariaChatRoomId: 'room-1' },
    });

    expect(tenant.settings.pendingApprovalNotifyEnabled).toBe(true);
    expect(tenant.settings.ezariaChatRoomId).toBe('room-1');
  });

  it('빈 채팅방 ID는 null로 정규화한다', async () => {
    const { service, tenant } = buildService();
    tenant.settings.ezariaChatRoomId = 'room-1';

    await service.update(tenantId, { settings: { ezariaChatRoomId: '   ' } });

    expect(tenant.settings.ezariaChatRoomId).toBeNull();
  });

  it('테스트 발송 성공을 감사 로그에 남긴다', async () => {
    const { service, auditService, notifier } = buildService({ sent: true });

    await expect(service.sendNotifyTest(tenantId)).resolves.toEqual({ sent: true });
    expect(notifier.sendTest).toHaveBeenCalledWith(tenantId);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.NOTIFY_TEST_SENT,
        metadata: { channel: 'ezaria', sent: true, reason: null },
      }),
    );
  });

  it('테스트 발송 실패도 예외 없이 이유와 함께 반환하고 감사 로그를 남긴다', async () => {
    const { service, auditService } = buildService({ sent: false, reason: 'chat_room_not_set' });

    await expect(service.sendNotifyTest(tenantId)).resolves.toEqual({
      sent: false,
      reason: 'chat_room_not_set',
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { channel: 'ezaria', sent: false, reason: 'chat_room_not_set' },
      }),
    );
  });
});
