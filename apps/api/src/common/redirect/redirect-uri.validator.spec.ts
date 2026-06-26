import { RedirectUriValidator } from './redirect-uri.validator';

describe('RedirectUriValidator', () => {
  let repo: { find: jest.Mock };
  let validator: RedirectUriValidator;

  beforeEach(() => {
    repo = { find: jest.fn() };
    validator = new RedirectUriValidator(repo as never);
  });

  function withRegistered(uris: string[]) {
    repo.find.mockResolvedValue(uris.map((uri) => ({ uri })));
  }

  it('allows a candidate whose origin matches a registered redirect_uri origin', async () => {
    withRegistered(['https://app.example.com/callback']);
    await expect(validator.isAllowed('client-1', 'https://app.example.com/login')).resolves.toBe(
      true,
    );
  });

  it('allows a candidate with a different path on the same origin', async () => {
    withRegistered(['https://app.example.com/oauth/callback']);
    await expect(
      validator.isAllowed('client-1', 'https://app.example.com/welcome?ref=verify'),
    ).resolves.toBe(true);
  });

  it('rejects a candidate on a different host (open redirect)', async () => {
    withRegistered(['https://app.example.com/callback']);
    await expect(validator.isAllowed('client-1', 'https://evil.example.com/login')).resolves.toBe(
      false,
    );
  });

  it('rejects a candidate on a different scheme or port', async () => {
    withRegistered(['https://app.example.com/callback']);
    await expect(validator.isAllowed('client-1', 'http://app.example.com/login')).resolves.toBe(
      false,
    );
    await expect(
      validator.isAllowed('client-1', 'https://app.example.com:8443/login'),
    ).resolves.toBe(false);
  });

  it('rejects malformed candidate URLs', async () => {
    withRegistered(['https://app.example.com/callback']);
    await expect(validator.isAllowed('client-1', 'not-a-url')).resolves.toBe(false);
    await expect(validator.isAllowed('client-1', 'javascript:alert(1)')).resolves.toBe(false);
  });

  it('rejects when clientId or candidate is missing', async () => {
    await expect(validator.isAllowed(null, 'https://app.example.com')).resolves.toBe(false);
    await expect(validator.isAllowed('client-1', null)).resolves.toBe(false);
    expect(repo.find).not.toHaveBeenCalled();
  });

  it('rejects when the client has no registered redirect URIs', async () => {
    withRegistered([]);
    await expect(validator.isAllowed('client-1', 'https://app.example.com/login')).resolves.toBe(
      false,
    );
  });
});
