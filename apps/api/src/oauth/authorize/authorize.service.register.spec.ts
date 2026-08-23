import { UserStatus } from '../../database/entities';
import { AuthorizeService } from './authorize.service';
import type { RegisterDto } from './dto/register.dto';

interface Settings {
  allowRegistration: boolean;
  passwordMinLength: number;
  autoActivateRegistration: boolean;
  emailVerificationRequired: boolean;
}

function build(settings: Partial<Settings> = {}, notifyImpl?: () => Promise<void>) {
  const merged: Settings = {
    allowRegistration: true,
    passwordMinLength: 8,
    autoActivateRegistration: false,
    emailVerificationRequired: false,
    ...settings,
  };

  const savedUser = {
    id: 'user-1',
    email: 'jinho@ez.com',
    createdAt: new Date('2026-08-23T05:03:00Z'),
    pendingApprovalSince: null as Date | null,
  };

  const userRepo = { update: jest.fn().mockResolvedValue(undefined) };
  const settingsRepo = { findOne: jest.fn().mockResolvedValue(merged) };
  const usersService = { create: jest.fn().mockResolvedValue(savedUser) };
  const rbacService = { assignDefaultRolesToUser: jest.fn().mockResolvedValue(undefined) };
  const emailVerificationService = { issueAndSend: jest.fn().mockResolvedValue(undefined) };
  const notifier = {
    notifyNewPending: jest.fn(notifyImpl ?? (() => Promise.resolve())),
  };

  const service = new AuthorizeService(
    { findOne: jest.fn().mockResolvedValue(null) } as never, // clientRepo
    {} as never, // redirectUriRepo
    {} as never, // codeRepo
    userRepo as never,
    {} as never, // profileRepo
    {} as never, // schemaRepo
    {} as never, // consentRepo
    settingsRepo as never,
    {} as never, // dataSource
    {} as never, // auditService
    {} as never, // externalAuthService
    usersService as never,
    {} as never, // scopesService
    rbacService as never,
    emailVerificationService as never,
    {} as never, // redirectUriValidator
    notifier as never,
    {} as never, // pendingStore
  );

  return { service, userRepo, usersService, emailVerificationService, notifier, savedUser };
}

const dto: RegisterDto = {
  email: 'jinho@ez.com',
  password: 'password123',
} as RegisterDto;

describe('AuthorizeService.register — 승인 대기 알림', () => {
  it('이메일 인증·자동 활성화가 모두 꺼져 있으면 표식을 남기고 알림을 보낸다', async () => {
    const { service, userRepo, usersService, notifier } = build();

    const result = await service.register('t1', 'acme', dto);

    expect(usersService.create).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ initialStatus: UserStatus.INACTIVE }),
      expect.anything(),
    );
    expect(userRepo.update).toHaveBeenCalledWith(
      { id: 'user-1' },
      expect.objectContaining({ pendingApprovalSince: expect.any(Date) }),
    );
    expect(notifier.notifyNewPending).toHaveBeenCalledWith('t1', {
      email: 'jinho@ez.com',
      createdAt: new Date('2026-08-23T05:03:00Z'),
    });
    expect(result.emailVerificationRequired).toBe(false);
  });

  it('자동 활성화가 켜져 있으면 표식도 알림도 없다', async () => {
    const { service, userRepo, usersService, notifier } = build({
      autoActivateRegistration: true,
    });

    await service.register('t1', 'acme', dto);

    expect(usersService.create).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ initialStatus: UserStatus.ACTIVE }),
      expect.anything(),
    );
    expect(userRepo.update).not.toHaveBeenCalled();
    expect(notifier.notifyNewPending).not.toHaveBeenCalled();
  });

  it('이메일 인증이 켜져 있으면 인증 메일만 보내고 승인 대기 알림은 보내지 않는다', async () => {
    const { service, userRepo, emailVerificationService, notifier } = build({
      emailVerificationRequired: true,
    });

    const result = await service.register('t1', 'acme', dto);

    expect(emailVerificationService.issueAndSend).toHaveBeenCalled();
    expect(userRepo.update).not.toHaveBeenCalled();
    expect(notifier.notifyNewPending).not.toHaveBeenCalled();
    expect(result.emailVerificationRequired).toBe(true);
  });

  it('알림 발송이 실패해도 가입은 성공한다', async () => {
    const { service, notifier } = build({}, () => Promise.reject(new Error('boom')));

    await expect(service.register('t1', 'acme', dto)).resolves.toMatchObject({
      message: 'registered',
      id: 'user-1',
    });
    expect(notifier.notifyNewPending).toHaveBeenCalled();
  });
});
