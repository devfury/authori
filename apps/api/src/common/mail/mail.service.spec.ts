import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailService, VerificationEmailParams } from './mail.service';

jest.mock('nodemailer');

function makeService(host: string): MailService {
  const config = {
    get: (key: string) => {
      if (key === 'app.smtp')
        return { host, port: 587, secure: false, user: '', pass: '', tlsRejectUnauthorized: true };
      if (key === 'app.nodeEnv') return 'development';
      return undefined;
    },
  } as unknown as ConfigService;
  return new MailService(config);
}

describe('MailService', () => {
  const sendMail = jest.fn();

  const baseParams: VerificationEmailParams = {
    to: 'user@example.com',
    verifyUrl: 'https://auth.example.com/verify-email?token=abc',
    serviceName: 'Acme',
    brandColor: null,
    ttlSeconds: 86400,
  };

  function buildService(nodeEnv: 'development' | 'production') {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'app.smtp') {
          return {
            host: 'smtp.example.com',
            port: 587,
            secure: false,
            user: 'u',
            pass: 'p',
            tlsRejectUnauthorized: true,
          };
        }
        if (key === 'app.nodeEnv') return nodeEnv;
        return undefined;
      }),
    };
    return new MailService(config as never);
  }

  beforeEach(() => {
    sendMail.mockReset();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
  });

  it('테넌트 from이 없으면 기본 발신자를 사용한다', async () => {
    const service = buildService('development');
    await service.sendVerificationEmail({ ...baseParams, from: null });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Authori <no-reply@authori.local>' }),
    );
  });

  it('테넌트 from이 있으면 그 값을 발신자로 사용한다', async () => {
    const service = buildService('development');
    await service.sendVerificationEmail({ ...baseParams, from: 'Acme <no-reply@acme.com>' });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Acme <no-reply@acme.com>' }),
    );
  });

  it('development에서 devRedirectTo가 설정되면 수신자를 강제 변경한다', async () => {
    const service = buildService('development');
    await service.sendVerificationEmail({ ...baseParams, devRedirectTo: 'dev@acme.com' });

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'dev@acme.com' }));
  });

  it('production에서는 devRedirectTo가 설정되어도 원래 수신자로 발송한다', async () => {
    const service = buildService('production');
    await service.sendVerificationEmail({ ...baseParams, devRedirectTo: 'dev@acme.com' });

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'user@example.com' }));
  });

  it('devRedirectTo가 없으면 원래 수신자로 발송한다', async () => {
    const service = buildService('development');
    await service.sendVerificationEmail({ ...baseParams, devRedirectTo: null });

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'user@example.com' }));
  });

  it('development에서 devRedirectTo에 콤마로 여러 주소를 넣으면 모두에게 발송한다', async () => {
    const service = buildService('development');
    await service.sendVerificationEmail({
      ...baseParams,
      devRedirectTo: 'dev1@acme.com, dev2@acme.com , dev3@acme.com',
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['dev1@acme.com', 'dev2@acme.com', 'dev3@acme.com'] }),
    );
  });

  it('devRedirectTo가 콤마와 공백뿐이면 원래 수신자로 발송한다', async () => {
    const service = buildService('development');
    await service.sendVerificationEmail({ ...baseParams, devRedirectTo: ' , ' });

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'user@example.com' }));
  });
});

describe('MailService.isConfigured', () => {
  it('SMTP host 미설정이면 false', () => {
    expect(makeService('').isConfigured).toBe(false);
  });

  it('SMTP host 설정이면 true', () => {
    expect(makeService('smtp.example.com').isConfigured).toBe(true);
  });

  it('미설정 상태에서 재설정 메일은 throw 없이 반환한다', async () => {
    await expect(
      makeService('').sendPasswordResetEmail({
        to: 'u@e.com',
        resetUrl: 'https://x/reset?token=t',
        serviceName: 'svc',
        ttlSeconds: 3600,
      }),
    ).resolves.toBeUndefined();
  });
});
