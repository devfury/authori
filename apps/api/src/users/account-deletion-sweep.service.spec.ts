import { AccountDeletionSweepService } from './account-deletion-sweep.service';

type MockManager = { query: jest.Mock };

/** dataSource.transaction(cb) 목: cb 를 typed manager 로 즉시 호출해 결과를 반환한다 */
function mockDataSource(manager: MockManager) {
  return {
    transaction: jest.fn((cb: (m: MockManager) => Promise<void>): Promise<void> => cb(manager)),
  };
}

describe('AccountDeletionSweepService.sweep', () => {
  it('advisory lock을 얻지 못하면 삭제하지 않는다', async () => {
    const del = jest.fn();
    const manager: MockManager = { query: jest.fn().mockResolvedValue([{ locked: false }]) };
    const dataSource = mockDataSource(manager);
    const svc = new AccountDeletionSweepService(dataSource as any, { delete: del } as any);
    await svc.sweep();
    expect(del).not.toHaveBeenCalled();
  });

  it('락 획득 시 대상 사용자를 usersService.delete로 삭제한다', async () => {
    const del = jest.fn().mockResolvedValue(undefined);
    const manager: MockManager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ locked: true }]) // advisory lock
        .mockResolvedValueOnce([{ id: 'u1', tenant_id: 't1' }]), // 대상 조회
    };
    const dataSource = mockDataSource(manager);
    const svc = new AccountDeletionSweepService(dataSource as any, { delete: del } as any);
    await svc.sweep();
    expect(del).toHaveBeenCalledWith('t1', 'u1', expect.anything());
  });
});
