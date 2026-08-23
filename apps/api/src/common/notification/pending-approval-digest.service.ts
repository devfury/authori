import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { PendingApprovalNotifierService } from './pending-approval-notifier.service';

/** 승인 대기 다이제스트 전용 advisory lock 키 (고정 상수) */
const PENDING_APPROVAL_DIGEST_LOCK_KEY = 481924;

/**
 * 관리자 승인 대기 사용자가 남아 있는 테넌트에 매일 잔량을 다시 알린다.
 * 가입 즉시 알림을 놓쳐도 계정이 무한히 방치되지 않게 하는 백스톱이다.
 */
@Injectable()
export class PendingApprovalDigestService {
  private readonly logger = new Logger(PendingApprovalDigestService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly notifier: PendingApprovalNotifierService,
  ) {}

  @Cron('0 0 9 * * *', { timeZone: 'Asia/Seoul' })
  async run(): Promise<void> {
    const tenantIds = await this.dataSource.transaction(async (manager) => {
      const rows = await manager.query<Array<{ locked: boolean | string }>>(
        'SELECT pg_try_advisory_xact_lock($1) AS locked',
        [PENDING_APPROVAL_DIGEST_LOCK_KEY],
      );
      const locked = rows[0]?.locked === true || rows[0]?.locked === 't';
      if (!locked) {
        this.logger.debug('다른 인스턴스가 다이제스트 실행 중 — skip');
        return [];
      }
      return this.findTenantsWithPending(manager);
    });

    if (tenantIds.length === 0) {
      this.logger.debug('승인 대기 다이제스트 대상 없음');
      return;
    }

    // 테넌트 단위로 격리한다. 한 테넌트 발송 실패가 나머지를 멈추지 않는다.
    for (const tenantId of tenantIds) {
      await this.notifier.notifyDigest(tenantId);
    }
  }

  /**
   * 알림이 켜지고 채팅방이 설정된 테넌트 중 승인 대기 사용자가 1건 이상인 테넌트만 고른다.
   * 락을 잡은 트랜잭션 안에서 한 번의 집계 쿼리로 후보를 좁힌다.
   */
  private async findTenantsWithPending(manager: EntityManager): Promise<string[]> {
    const rows = await manager.query<Array<{ tenant_id: string }>>(`
      SELECT u.tenant_id
      FROM users u
      JOIN tenant_settings ts ON ts.tenant_id = u.tenant_id
      WHERE u.status = 'INACTIVE'
        AND u.deactivated_at IS NULL
        AND u.pending_approval_since IS NOT NULL
        AND ts.pending_approval_notify_enabled = true
        AND ts.ezaria_chat_room_id IS NOT NULL
      GROUP BY u.tenant_id
    `);
    return rows.map((row) => row.tenant_id);
  }
}
