import { PendingRequestCleanupService } from './pending-request-cleanup.service';

describe('PendingRequestCleanupService', () => {
  let repo: { createQueryBuilder: jest.Mock };
  let qb: {
    delete: jest.Mock;
    where: jest.Mock;
    execute: jest.Mock;
  };
  let service: PendingRequestCleanupService;

  beforeEach(() => {
    qb = {
      delete: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 3 }),
    };
    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    service = new PendingRequestCleanupService(repo as never);
  });

  it('deletes rows where expires_at is in the past', async () => {
    await service.cleanup();

    expect(qb.delete).toHaveBeenCalled();
    expect(qb.where).toHaveBeenCalledWith('expires_at < :now', {
      now: expect.any(Date),
    });
    expect(qb.execute).toHaveBeenCalled();
  });
});
