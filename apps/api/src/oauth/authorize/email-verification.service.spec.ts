import { EmailVerificationService } from './email-verification.service';

/**
 * resolveContinueUrl 우선순위 체인 검증.
 * 이미 활성화된(usedAt 설정) 토큰의 멱등 경로를 사용해 트랜잭션 없이
 * continueUrl 해석만 검증한다.
 */
describe('EmailVerificationService.confirm — continueUrl 해석', () => {
  let tokenRepo: { findOne: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let clientRepo: { findOne: jest.Mock };
  let validator: { isAllowed: jest.Mock };
  let service: EmailVerificationService;

  const tenantId = 'tenant-1';
  const clientId = 'client-1';

  beforeEach(() => {
    tokenRepo = { findOne: jest.fn() };
    userRepo = { findOne: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.com' }) };
    clientRepo = { findOne: jest.fn() };
    validator = { isAllowed: jest.fn() };

    service = new EmailVerificationService(
      tokenRepo as never,
      userRepo as never,
      {} as never, // tenantRepo (unused here)
      clientRepo as never,
      {} as never, // config (unused here)
      {} as never, // mailService (unused here)
      {} as never, // auditService (unused here, 멱등 경로는 record 호출 안 함)
      validator as never,
    );
  });

  function givenToken(overrides: Record<string, unknown>) {
    tokenRepo.findOne.mockResolvedValue({
      tenantId,
      userId: 'u1',
      usedAt: new Date(), // 멱등 경로
      expiresAt: new Date(Date.now() + 100000),
      clientId,
      continueUri: null,
      ...overrides,
    });
  }

  it('1순위: 검증 통과한 동적 continueUri를 사용한다', async () => {
    givenToken({ continueUri: 'https://app.example.com/deep' });
    validator.isAllowed.mockResolvedValueOnce(true);

    const res = await service.confirm(tenantId, 'raw');
    expect(res.continueUrl).toBe('https://app.example.com/deep');
    expect(clientRepo.findOne).not.toHaveBeenCalled();
  });

  it('2순위: 동적 미통과 시 클라이언트 기본값(검증 통과)을 사용한다', async () => {
    givenToken({ continueUri: 'https://evil.example.com' });
    clientRepo.findOne.mockResolvedValue({
      postVerificationRedirectUri: 'https://app.example.com/login',
    });
    // 1) 동적 미통과 → 2) 클라이언트 기본 통과
    validator.isAllowed.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const res = await service.confirm(tenantId, 'raw');
    expect(res.continueUrl).toBe('https://app.example.com/login');
  });

  it('3순위: 동적·클라이언트 기본 모두 없거나 미통과면 undefined(폴백)', async () => {
    givenToken({ continueUri: null });
    clientRepo.findOne.mockResolvedValue({ postVerificationRedirectUri: null });

    const res = await service.confirm(tenantId, 'raw');
    expect(res.continueUrl).toBeUndefined();
  });

  it('클라이언트 기본값이 allowlist 미통과면 undefined(폴백)', async () => {
    givenToken({ continueUri: null });
    clientRepo.findOne.mockResolvedValue({
      postVerificationRedirectUri: 'https://evil.example.com',
    });
    validator.isAllowed.mockResolvedValue(false);

    const res = await service.confirm(tenantId, 'raw');
    expect(res.continueUrl).toBeUndefined();
  });

  it('clientId가 없으면 클라이언트 조회 없이 폴백', async () => {
    givenToken({ clientId: null, continueUri: null });

    const res = await service.confirm(tenantId, 'raw');
    expect(res.continueUrl).toBeUndefined();
    expect(clientRepo.findOne).not.toHaveBeenCalled();
  });
});
