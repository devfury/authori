import { TypeOrmPendingRequestStore } from './typeorm-pending-request.store';

const BASE_REQUEST = {
  tenantId: 'tenant-1',
  tenantSlug: 'acme',
  clientId: 'client-1',
  redirectUri: 'https://app.example.com/callback',
  scopes: ['openid', 'profile'],
};

describe('TypeOrmPendingRequestStore', () => {
  let repo: {
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
  };
  let store: TypeOrmPendingRequestStore;

  beforeEach(() => {
    repo = {
      save: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
    };
    store = new TypeOrmPendingRequestStore(repo as never);
  });

  describe('save', () => {
    it('persists a new row and returns a UUID string', async () => {
      repo.save.mockResolvedValue(undefined);

      const id = await store.save(BASE_REQUEST);

      expect(typeof id).toBe('string');
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id,
          tenantId: 'tenant-1',
          scopes: ['openid', 'profile'],
          expiresAt: expect.any(Date),
        }),
      );
    });
  });

  describe('get', () => {
    it('returns null when the row does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await store.get('non-existent-id');

      expect(result).toBeNull();
    });

    it('returns null and deletes the row when expired', async () => {
      const expiredRow = {
        id: 'req-1',
        ...BASE_REQUEST,
        state: null,
        codeChallenge: null,
        codeChallengeMethod: null,
        expiresAt: new Date(Date.now() - 1000),
      };
      repo.findOne.mockResolvedValue(expiredRow);
      repo.delete.mockResolvedValue(undefined);

      const result = await store.get('req-1');

      expect(result).toBeNull();
      expect(repo.delete).toHaveBeenCalledWith('req-1');
    });

    it('returns PendingAuthRequest when row is valid', async () => {
      const validRow = {
        id: 'req-2',
        ...BASE_REQUEST,
        state: 'xyz',
        codeChallenge: 'abc123',
        codeChallengeMethod: 'S256',
        expiresAt: new Date(Date.now() + 60_000),
      };
      repo.findOne.mockResolvedValue(validRow);

      const result = await store.get('req-2');

      expect(result).toMatchObject({
        tenantId: 'tenant-1',
        tenantSlug: 'acme',
        clientId: 'client-1',
        scopes: ['openid', 'profile'],
        state: 'xyz',
        codeChallenge: 'abc123',
        codeChallengeMethod: 'S256',
      });
      expect(typeof result!.expiresAt).toBe('number');
    });

    it('returns undefined for state/codeChallenge when DB columns are null', async () => {
      const validRow = {
        id: 'req-3',
        ...BASE_REQUEST,
        state: null,
        codeChallenge: null,
        codeChallengeMethod: null,
        expiresAt: new Date(Date.now() + 60_000),
      };
      repo.findOne.mockResolvedValue(validRow);

      const result = await store.get('req-3');

      expect(result!.state).toBeUndefined();
      expect(result!.codeChallenge).toBeUndefined();
      expect(result!.codeChallengeMethod).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('calls repo.delete with the given id', async () => {
      repo.delete.mockResolvedValue(undefined);

      await store.delete('req-x');

      expect(repo.delete).toHaveBeenCalledWith('req-x');
    });
  });
});
