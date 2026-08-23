import { DataSource } from 'typeorm';
import { PendingApprovalDigestService } from './pending-approval-digest.service';
import { PendingApprovalNotifierService } from './pending-approval-notifier.service';

describe('PendingApprovalDigestService', () => {
  const notifyDigest = jest.fn();
  const notifier = { notifyDigest } as unknown as PendingApprovalNotifierService;

  /** locked 결과와 집계 결과를 순서대로 돌려주는 트랜잭션 매니저 스텁 */
  function buildDataSource(locked: boolean, tenantIds: string[]) {
    const query = jest.fn((sql: string) => {
      if (sql.includes('pg_try_advisory_xact_lock')) {
        return Promise.resolve([{ locked }]);
      }
      return Promise.resolve(tenantIds.map((id) => ({ tenant_id: id })));
    });
    return {
      dataSource: {
        transaction: (cb: (manager: unknown) => Promise<unknown>) => cb({ query }),
      } as unknown as DataSource,
      query,
    };
  }

  beforeEach(() => notifyDigest.mockReset());

  it('락을 못 잡으면 집계도 발송도 하지 않는다', async () => {
    const { dataSource, query } = buildDataSource(false, ['t1']);
    await new PendingApprovalDigestService(dataSource, notifier).run();

    expect(query).toHaveBeenCalledTimes(1);
    expect(notifyDigest).not.toHaveBeenCalled();
  });

  it('대기 건이 있는 테넌트마다 다이제스트를 발송한다', async () => {
    const { dataSource } = buildDataSource(true, ['t1', 't2']);
    await new PendingApprovalDigestService(dataSource, notifier).run();

    expect(notifyDigest).toHaveBeenCalledTimes(2);
    expect(notifyDigest).toHaveBeenCalledWith('t1');
    expect(notifyDigest).toHaveBeenCalledWith('t2');
  });

  it('대상 테넌트가 없으면 발송하지 않는다', async () => {
    const { dataSource } = buildDataSource(true, []);
    await new PendingApprovalDigestService(dataSource, notifier).run();

    expect(notifyDigest).not.toHaveBeenCalled();
  });

  it("advisory lock이 't' 문자열로 와도 락 획득으로 인정한다", async () => {
    const query = jest.fn((sql: string) =>
      sql.includes('pg_try_advisory_xact_lock')
        ? Promise.resolve([{ locked: 't' }])
        : Promise.resolve([{ tenant_id: 't1' }]),
    );
    const dataSource = {
      transaction: (cb: (manager: unknown) => Promise<unknown>) => cb({ query }),
    } as unknown as DataSource;

    await new PendingApprovalDigestService(dataSource, notifier).run();

    expect(notifyDigest).toHaveBeenCalledWith('t1');
  });
});
