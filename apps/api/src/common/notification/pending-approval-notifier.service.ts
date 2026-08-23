import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant, TenantSettings, User, UserStatus } from '../../database/entities';
import { EzariaClient } from './ezaria.client';
import { maskEmail } from './mask.util';

/** 테넌트의 관리자 승인 대기 현황 */
export interface PendingApprovalStat {
  count: number;
  /** 가장 오래 대기 중인 건의 대기 시작 시각 */
  oldestSince: Date | null;
  /** 가장 최근 가입 건의 대기 시작 시각 */
  latestSince: Date | null;
  /** 가장 오래 대기 중인 건의 이메일 (마스킹 전 원본) */
  oldestEmail: string | null;
}

/** 발송을 건너뛴 이유 */
export type SkipReason =
  | 'bot_not_configured'
  | 'notify_disabled'
  | 'chat_room_not_set'
  | 'tenant_not_found'
  | 'send_failed';

interface NotifyTarget {
  chatRoomId: string;
  tenantName: string;
}

/** Asia/Seoul 기준 `YYYY-MM-DD HH:mm` 포맷 */
function formatKst(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

/** 경과 일수 (내림) */
function daysElapsed(from: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000));
}

/**
 * 관리자 승인 대기 신규 가입자를 테넌트별 ezAria 채팅방으로 알린다.
 *
 * 발송 조건은 세 가지가 모두 충족될 때만 성립한다.
 *   1. 전역 ezAria 봇 토큰 설정
 *   2. 테넌트 설정의 `pendingApprovalNotifyEnabled`
 *   3. 테넌트 설정의 `ezariaChatRoomId`
 * 하나라도 없으면 발송을 건너뛰고 로그만 남긴다(SMTP 미설정 폴백과 동일한 방식).
 */
@Injectable()
export class PendingApprovalNotifierService {
  private readonly logger = new Logger(PendingApprovalNotifierService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(TenantSettings)
    private readonly settingsRepo: Repository<TenantSettings>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly ezaria: EzariaClient,
    private readonly config: ConfigService,
  ) {}

  /**
   * 가입 즉시 알림. 회원가입 흐름에서 호출되므로 어떤 예외도 밖으로 전파하지 않는다.
   */
  async notifyNewPending(tenantId: string, user: { email: string; createdAt: Date }): Promise<void> {
    try {
      const target = await this.resolveTarget(tenantId);
      if (typeof target === 'string') {
        this.logger.debug(`승인 대기 알림 skip tenantId=${tenantId} reason=${target}`);
        return;
      }

      const { count } = await this.countPending(tenantId);
      const content = [
        `🔔 [${target.tenantName}] 신규 가입 승인 대기`,
        `- 가입자: ${maskEmail(user.email)}`,
        `- 가입: ${formatKst(user.createdAt)} (KST)`,
        `- 현재 승인 대기: 총 ${count}건`,
        `- 승인 화면: ${this.adminUsersUrl(tenantId)}`,
      ].join('\n');

      await this.ezaria.send(target.chatRoomId, content);
    } catch (error) {
      this.logger.error(`승인 대기 알림 발송 실패 tenantId=${tenantId}: ${(error as Error).message}`);
    }
  }

  /**
   * 잔량 다이제스트. 대기 건이 0이면 발송하지 않는다.
   * 스케줄러가 테넌트를 순회하므로 예외를 전파하지 않는다.
   */
  async notifyDigest(tenantId: string, now: Date = new Date()): Promise<void> {
    try {
      const target = await this.resolveTarget(tenantId);
      if (typeof target === 'string') {
        this.logger.debug(`승인 대기 다이제스트 skip tenantId=${tenantId} reason=${target}`);
        return;
      }

      const stat = await this.countPending(tenantId);
      if (stat.count === 0) {
        this.logger.debug(`승인 대기 0건 — 다이제스트 생략 tenantId=${tenantId}`);
        return;
      }

      const lines = [`🔔 [${target.tenantName}] 승인 대기 사용자 ${stat.count}건`];
      if (stat.oldestSince) {
        const oldest = `${daysElapsed(stat.oldestSince, now)}일 경과`;
        lines.push(
          stat.oldestEmail
            ? `- 최장 대기: ${oldest} (${maskEmail(stat.oldestEmail)})`
            : `- 최장 대기: ${oldest}`,
        );
      }
      if (stat.latestSince) {
        lines.push(`- 최근 가입: ${formatKst(stat.latestSince)} (KST)`);
      }
      lines.push(`- 승인 화면: ${this.adminUsersUrl(tenantId)}`);

      await this.ezaria.send(target.chatRoomId, lines.join('\n'));
    } catch (error) {
      this.logger.error(
        `승인 대기 다이제스트 발송 실패 tenantId=${tenantId}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * 설정한 채팅방으로 실제 도달하는지 확인하는 테스트 발송.
   * 관리 UI에서 저장 전 오타를 잡기 위한 용도이므로 실패도 예외가 아닌 결과로 돌려준다.
   */
  async sendTest(tenantId: string): Promise<{ sent: boolean; reason?: SkipReason }> {
    const target = await this.resolveTarget(tenantId);
    if (typeof target === 'string') {
      return { sent: false, reason: target };
    }

    const content = [
      `🔔 [${target.tenantName}] ezAria 알림 테스트`,
      '- 이 채팅방으로 승인 대기 알림이 발송됩니다.',
    ].join('\n');

    try {
      await this.ezaria.send(target.chatRoomId, content);
      return { sent: true };
    } catch (error) {
      this.logger.error(`ezAria 테스트 발송 실패 tenantId=${tenantId}: ${(error as Error).message}`);
      return { sent: false, reason: 'send_failed' };
    }
  }

  /**
   * 관리자 승인 대기 사용자 현황을 집계한다.
   * 탈퇴(`deactivatedAt`)와 이메일 인증 대기는 `pendingApprovalSince` 표식으로 이미 제외된다.
   */
  async countPending(tenantId: string): Promise<PendingApprovalStat> {
    const base = () =>
      this.userRepo
        .createQueryBuilder('u')
        .where('u.tenantId = :tenantId', { tenantId })
        .andWhere('u.status = :status', { status: UserStatus.INACTIVE })
        .andWhere('u.deactivatedAt IS NULL')
        .andWhere('u.pendingApprovalSince IS NOT NULL');

    const count = await base().getCount();
    if (count === 0) {
      return { count: 0, oldestSince: null, latestSince: null, oldestEmail: null };
    }

    const [oldest, latest] = await Promise.all([
      base().orderBy('u.pendingApprovalSince', 'ASC').getOne(),
      base().orderBy('u.pendingApprovalSince', 'DESC').getOne(),
    ]);

    return {
      count,
      oldestSince: oldest?.pendingApprovalSince ?? null,
      latestSince: latest?.pendingApprovalSince ?? null,
      oldestEmail: oldest?.email ?? null,
    };
  }

  /** 발송 대상(채팅방·테넌트명)을 확정하거나 건너뛸 이유를 반환한다. */
  private async resolveTarget(tenantId: string): Promise<NotifyTarget | SkipReason> {
    if (!this.ezaria.isConfigured) return 'bot_not_configured';

    const settings = await this.settingsRepo.findOne({ where: { tenantId } });
    if (!settings?.pendingApprovalNotifyEnabled) return 'notify_disabled';

    const chatRoomId = settings.ezariaChatRoomId?.trim();
    if (!chatRoomId) return 'chat_room_not_set';

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) return 'tenant_not_found';

    return { chatRoomId, tenantName: tenant.name };
  }

  /** 알림에 넣을 관리 UI 사용자 목록 링크 */
  private adminUsersUrl(tenantId: string): string {
    const base = this.config.get<string>('app.adminBaseUrl') ?? '';
    return `${base}/admin/tenants/${tenantId}/users`;
  }
}
