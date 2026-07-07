import { PasswordResetService } from './password-reset.service';

interface MailMock {
  isConfigured: boolean;
  sendPasswordResetEmail: jest.Mock;
}

interface BuildOverrides {
  mail?: Partial<MailMock>;
  tokenRecord?: Record<string, unknown> | null;
  user?: { id: string; email: string } | null;
}

function build(overrides: BuildOverrides = {}) {
  const tokens: unknown[] = [];
  const mail: MailMock = {
    isConfigured: true,
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    ...overrides.mail,
  };
  const tokenRepo = {
    create: (v: unknown) => v,
    save: jest.fn((v: unknown) => {
      tokens.push(v);
      return Promise.resolve(v);
    }),
    findOne: jest.fn(() => Promise.resolve(overrides.tokenRecord ?? null)),
  };
  const userRepo = {
    findOne: jest.fn(() => Promise.resolve(overrides.user ?? null)),
  };
  const tenantRepo = {
    findOne: jest.fn(() =>
      Promise.resolve({
        name: 'svc',
        settings: { mailFrom: null, mailDevRedirectTo: null, passwordMinLength: 8 },
      }),
    ),
  };
  const config = {
    get: (k: string) => (k === 'app.passwordResetTtl' ? 3600 : 'http://localhost:5173/login'),
  };
  const svc = new PasswordResetService(
    tokenRepo as any,
    userRepo as any,
    tenantRepo as any,
    {} as any /* accessTokenRepo */,
    {} as any /* refreshTokenRepo */,
    {} as any /* dataSource */,
    config as any,
    mail as any,
    { record: jest.fn() } as any,
  );
  return { svc, mail, tokenRepo, userRepo, tokens };
}

describe('PasswordResetService.requestReset', () => {
  it('메일 미설정이면 계정 조회 없이 mail_delivery_failed', async () => {
    const { svc, userRepo } = build({
      mail: { isConfigured: false, sendPasswordResetEmail: jest.fn() },
    });
    const res = await svc.requestReset('t1', 'slug', 'u@e.com');
    expect(res.status).toBe('mail_delivery_failed');
    expect(userRepo.findOne).not.toHaveBeenCalled();
  });

  it('계정이 없으면 sent(열거 방지), 메일 미발송', async () => {
    const { svc, mail } = build({ user: null });
    const res = await svc.requestReset('t1', 'slug', 'missing@e.com');
    expect(res.status).toBe('sent');
    expect(mail.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('계정이 있으면 토큰 저장 후 메일 발송, sent', async () => {
    const { svc, mail, tokens } = build({ user: { id: 'u1', email: 'u@e.com' } });
    const res = await svc.requestReset('t1', 'slug', 'u@e.com');
    expect(res.status).toBe('sent');
    expect(tokens.length).toBe(1);
    expect(mail.sendPasswordResetEmail).toHaveBeenCalled();
  });

  it('발송 중 예외면 mail_delivery_failed', async () => {
    const { svc } = build({
      user: { id: 'u1', email: 'u@e.com' },
      mail: {
        isConfigured: true,
        sendPasswordResetEmail: jest.fn().mockRejectedValue(new Error('smtp down')),
      },
    });
    const res = await svc.requestReset('t1', 'slug', 'u@e.com');
    expect(res.status).toBe('mail_delivery_failed');
  });
});
