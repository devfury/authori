import * as nodemailer from 'nodemailer';
import { MailService, VerificationEmailParams } from './mail.service';

jest.mock('nodemailer');

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
});
