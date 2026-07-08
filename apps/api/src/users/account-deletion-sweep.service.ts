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
   *
   * NOTE: 이 조회는 FOR UPDATE ... SKIP LOCKED 를 사용하지 않는다. sweep()에서 획득한
   * pg_try_advisory_xact_lock 이 모든 인스턴스에서 스윕을 1개로 직렬화하므로 행 잠금으로
   * 중복 처리를 막을 필요가 없다. 오히려 여기서 행 잠금을 걸면, 이 메서드가 실행 중인
   * 트랜잭션(A)이 그 잠금을 트랜잭션 종료까지 들고 있는 상태에서 아래 usersService.delete()가
   * 별도 트랜잭션(B)을 열어 동일 행에 DELETE를 시도해 B가 A의 잠금을 기다리고 A는 B의 완료를
   * 기다리는 자기 교착(self-deadlock)이 발생한다(인스턴스가 1개, 대상이 1건이어도 발생).
   */
  private async runSweep(manager: EntityManager): Promise<void> {
    const targets = await manager.query<Array<{ id: string; tenant_id: string }>>(`
      SELECT u.id, u.tenant_id
      FROM users u
      JOIN tenant_settings ts ON ts.tenant_id = u.tenant_id
      WHERE u.status = 'INACTIVE'
        AND u.deactivated_at IS NOT NULL
        AND u.deactivated_at < (now() - (ts.account_deletion_grace_period_days || ' days')::interval)
    `);

    if (targets.length === 0) {
      this.logger.debug('삭제 대상 없음');
      return;
    }

    let succeeded = 0;
    let failed = 0;
    for (const t of targets) {
      try {
        // NOTE: AuditContext(common/audit/audit.service.ts)에는 metadata 필드가 없어
        // 스윕 출처("account_deletion_sweep")를 ctx로 전달할 수 없다.
        // usersService.delete()가 내부적으로 기록하는 AuditLog metadata는 { email }만 포함되며,
        // 스윕에서 삭제되었다는 provenance는 actorType: 'system' + 이 서비스의 로그로만 구분된다.
        // metadata에 source를 남기려면 delete()의 AuditContext 시그니처 확장이 필요하다(별도 설계 결정 필요).
        await this.usersService.delete(t.tenant_id, t.id, { actorType: 'system' });
        succeeded++;
      } catch (error) {
        // 한 건이 실패해도 나머지 대상 처리를 계속한다. 실패한 대상은 다음 스윕에서 재시도된다.
        failed++;
        this.logger.error(
          `계정 삭제 실패 userId=${t.id} tenantId=${t.tenant_id}: ${(error as Error).message}`,
        );
      }
    }
    this.logger.log(`유예기간 경과 계정 삭제 완료 — 성공 ${succeeded}건, 실패 ${failed}건`);
  }
}
