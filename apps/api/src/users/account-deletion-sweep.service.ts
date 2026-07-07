import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { UsersService } from './users.service';

/** 삭제 스윕 전용 advisory lock 키 (고정 상수) */
const ACCOUNT_SWEEP_LOCK_KEY = 481923;

@Injectable()
export class AccountDeletionSweepService {
  private readonly logger = new Logger(AccountDeletionSweepService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async sweep(): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const rows = await manager.query<Array<{ locked: boolean | string }>>(
        'SELECT pg_try_advisory_xact_lock($1) AS locked',
        [ACCOUNT_SWEEP_LOCK_KEY],
      );
      const locked = rows[0]?.locked === true || rows[0]?.locked === 't';
      if (!locked) {
        this.logger.debug('다른 인스턴스가 스윕 실행 중 — skip');
        return;
      }
      await this.runSweep(manager);
    });
  }

  /**
   * status=INACTIVE 이고 deactivated_at 이 테넌트별 유예기간을 초과한 사용자를 삭제한다.
   * deactivated_at IS NOT NULL 조건으로 미인증 INACTIVE 계정은 제외된다.
   * FOR UPDATE SKIP LOCKED 로 잠근 행만 취득해 중복 처리를 방지한다.
   */
  private async runSweep(manager: EntityManager): Promise<void> {
    const targets = await manager.query<Array<{ id: string; tenant_id: string }>>(`
      SELECT u.id, u.tenant_id
      FROM users u
      JOIN tenant_settings ts ON ts.tenant_id = u.tenant_id
      WHERE u.status = 'INACTIVE'
        AND u.deactivated_at IS NOT NULL
        AND u.deactivated_at < (now() - (ts.account_deletion_grace_period_days || ' days')::interval)
      FOR UPDATE OF u SKIP LOCKED
    `);

    if (targets.length === 0) {
      this.logger.debug('삭제 대상 없음');
      return;
    }

    for (const t of targets) {
      // NOTE: AuditContext(common/audit/audit.service.ts)에는 metadata 필드가 없어
      // 스윕 출처("account_deletion_sweep")를 ctx로 전달할 수 없다.
      // usersService.delete()가 내부적으로 기록하는 AuditLog metadata는 { email }만 포함되며,
      // 스윕에서 삭제되었다는 provenance는 actorType: 'system' + 이 서비스의 로그로만 구분된다.
      // metadata에 source를 남기려면 delete()의 AuditContext 시그니처 확장이 필요하다(별도 설계 결정 필요).
      await this.usersService.delete(t.tenant_id, t.id, { actorType: 'system' });
    }
    this.logger.log(`유예기간 경과 계정 ${targets.length}건 삭제`);
  }
}
