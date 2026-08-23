import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Tenant, TenantSettings, User } from '../../database/entities';
import { EzariaClient } from './ezaria.client';
import { PendingApprovalNotifierService } from './pending-approval-notifier.service';

interface PendingUser {
  email: string;
  pendingApprovalSince: Date;
}

interface Options {
  configured?: boolean;
  enabled?: boolean;
  chatRoomId?: string | null;
  tenantExists?: boolean;
  pending?: PendingUser[];
  sendImpl?: () => Promise<void>;
}

function build(opts: Options = {}) {
  const {
    configured = true,
    enabled = true,
    chatRoomId = 'room-1',
    tenantExists = true,
    pending = [],
    sendImpl,
  } = opts;

  const send = jest.fn(sendImpl ?? (() => Promise.resolve()));
  const ezaria = { isConfigured: configured, send } as unknown as EzariaClient;

  const tenantRepo = {
    findOne: jest.fn(() => Promise.resolve(tenantExists ? ({ name: 'Acme' } as Tenant) : null)),
  } as unknown as Repository<Tenant>;

  const settingsRepo = {
    findOne: jest.fn(() =>
      Promise.resolve({
        pendingApprovalNotifyEnabled: enabled,
        ezariaChatRoomId: chatRoomId,
      } as TenantSettings),
    ),
  } as unknown as Repository<TenantSettings>;

  // pendingApprovalSince 오름/내림 정렬을 흉내내는 쿼리빌더 스텁
  const sorted = [...pending].sort(
    (a, b) => a.pendingApprovalSince.getTime() - b.pendingApprovalSince.getTime(),
  );
  function makeQb() {
    let asc = true;
    const qb: Record<string, unknown> = {};
    qb.where = () => qb;
    qb.andWhere = () => qb;
    qb.orderBy = (_field: string, direction: 'ASC' | 'DESC') => {
      asc = direction === 'ASC';
      return qb;
    };
    qb.getCount = () => Promise.resolve(sorted.length);
    qb.getOne = () => Promise.resolve(asc ? sorted[0] : sorted[sorted.length - 1]);
    return qb;
  }
  const userRepo = { createQueryBuilder: () => makeQb() } as unknown as Repository<User>;

  const config = {
    get: (key: string) => (key === 'app.adminBaseUrl' ? 'https://admin.example.com' : undefined),
  } as unknown as ConfigService;

  const service = new PendingApprovalNotifierService(
    tenantRepo,
    settingsRepo,
    userRepo,
    ezaria,
    config,
  );
  return { service, send };
}

const newUser = { email: 'jinho@ez.com', createdAt: new Date('2026-08-23T05:03:00Z') };

describe('PendingApprovalNotifierService', () => {
  describe('notifyNewPending', () => {
    it('테넌트명·마스킹 이메일·건수·승인 링크를 담아 발송한다', async () => {
      const { service, send } = build({ pending: [{ email: 'jinho@ez.com', pendingApprovalSince: new Date('2026-08-23T05:03:00Z') }] });

      await service.notifyNewPending('t1', newUser);

      expect(send).toHaveBeenCalledTimes(1);
      const [room, content] = send.mock.calls[0];
      expect(room).toBe('room-1');
      expect(content).toContain('🔔 [Acme] 신규 가입 승인 대기');
      expect(content).toContain('- 가입자: j***@ez.com');
      expect(content).toContain('2026-08-23 14:03 (KST)');
      expect(content).toContain('- 현재 승인 대기: 총 1건');
      expect(content).toContain('https://admin.example.com/admin/tenants/t1/users');
      expect(content).not.toContain('jinho@ez.com');
    });

    it('봇 토큰이 없으면 발송하지 않는다', async () => {
      const { service, send } = build({ configured: false });
      await service.notifyNewPending('t1', newUser);
      expect(send).not.toHaveBeenCalled();
    });

    it('테넌트 알림이 꺼져 있으면 발송하지 않는다', async () => {
      const { service, send } = build({ enabled: false });
      await service.notifyNewPending('t1', newUser);
      expect(send).not.toHaveBeenCalled();
    });

    it('채팅방 ID가 비어 있으면 발송하지 않는다', async () => {
      const { service, send } = build({ chatRoomId: '   ' });
      await service.notifyNewPending('t1', newUser);
      expect(send).not.toHaveBeenCalled();
    });

    it('발송이 실패해도 예외를 전파하지 않는다', async () => {
      const { service, send } = build({ sendImpl: () => Promise.reject(new Error('boom')) });
      await expect(service.notifyNewPending('t1', newUser)).resolves.toBeUndefined();
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('notifyDigest', () => {
    it('대기 건수·최장 대기 경과일·최근 가입 시각을 담아 발송한다', async () => {
      const { service, send } = build({
        pending: [
          { email: 'old@ez.com', pendingApprovalSince: new Date('2026-08-18T05:03:00Z') },
          { email: 'new@ez.com', pendingApprovalSince: new Date('2026-08-23T05:03:00Z') },
        ],
      });

      await service.notifyDigest('t1', new Date('2026-08-23T09:00:00Z'));

      const [, content] = send.mock.calls[0];
      expect(content).toContain('🔔 [Acme] 승인 대기 사용자 2건');
      expect(content).toContain('- 최장 대기: 5일 경과 (o***@ez.com)');
      expect(content).toContain('- 최근 가입: 2026-08-23 14:03 (KST)');
      expect(content).toContain('https://admin.example.com/admin/tenants/t1/users');
    });

    it('대기 건이 0이면 발송하지 않는다', async () => {
      const { service, send } = build({ pending: [] });
      await service.notifyDigest('t1');
      expect(send).not.toHaveBeenCalled();
    });

    it('발송이 실패해도 예외를 전파하지 않는다', async () => {
      const { service } = build({
        pending: [{ email: 'a@ez.com', pendingApprovalSince: new Date() }],
        sendImpl: () => Promise.reject(new Error('boom')),
      });
      await expect(service.notifyDigest('t1')).resolves.toBeUndefined();
    });
  });

  describe('sendTest', () => {
    it('성공하면 sent=true를 반환한다', async () => {
      const { service, send } = build();
      await expect(service.sendTest('t1')).resolves.toEqual({ sent: true });
      const [, content] = send.mock.calls[0];
      expect(content).toContain('ezAria 알림 테스트');
    });

    it.each([
      [{ configured: false }, 'bot_not_configured'],
      [{ enabled: false }, 'notify_disabled'],
      [{ chatRoomId: null }, 'chat_room_not_set'],
      [{ tenantExists: false }, 'tenant_not_found'],
    ])('건너뛴 이유를 반환한다 (%o → %s)', async (opts, reason) => {
      const { service, send } = build(opts as Options);
      await expect(service.sendTest('t1')).resolves.toEqual({ sent: false, reason });
      expect(send).not.toHaveBeenCalled();
    });

    it('발송 실패는 send_failed로 반환한다', async () => {
      const { service } = build({ sendImpl: () => Promise.reject(new Error('boom')) });
      await expect(service.sendTest('t1')).resolves.toEqual({
        sent: false,
        reason: 'send_failed',
      });
    });
  });

  describe('countPending', () => {
    it('대기 0건이면 빈 집계를 반환한다', async () => {
      const { service } = build({ pending: [] });
      await expect(service.countPending('t1')).resolves.toEqual({
        count: 0,
        oldestSince: null,
        latestSince: null,
        oldestEmail: null,
      });
    });

    it('최장 대기 건의 이메일과 시각을 반환한다', async () => {
      const oldest = new Date('2026-08-18T05:03:00Z');
      const latest = new Date('2026-08-23T05:03:00Z');
      const { service } = build({
        pending: [
          { email: 'new@ez.com', pendingApprovalSince: latest },
          { email: 'old@ez.com', pendingApprovalSince: oldest },
        ],
      });

      await expect(service.countPending('t1')).resolves.toEqual({
        count: 2,
        oldestSince: oldest,
        latestSince: latest,
        oldestEmail: 'old@ez.com',
      });
    });
  });
});
