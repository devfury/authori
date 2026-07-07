import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/** 테넌트에 발신자 주소가 설정되지 않은 경우 사용할 기본 발신자 */
const DEFAULT_MAIL_FROM = 'Authori <no-reply@authori.local>';

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  /** TLS 인증서 검증 여부. false 면 자체 서명 인증서 허용(개발용) */
  tlsRejectUnauthorized: boolean;
}

export interface VerificationEmailParams {
  to: string;
  verifyUrl: string;
  /** 메일 헤더에 노출할 서비스/테넌트 이름 */
  serviceName: string;
  /** 버튼/강조 색상 (클라이언트 브랜딩). 없으면 기본 색상 */
  brandColor?: string | null;
  /** 링크 유효시간 (초) — 안내 문구용 */
  ttlSeconds: number;
  /** 발신자 주소(테넌트별). falsy면 기본 발신자 사용 */
  from?: string | null;
  /** 개발용 강제 수신자(테넌트별). NODE_ENV=development에서만 적용 */
  devRedirectTo?: string | null;
}

export interface PasswordResetEmailParams {
  to: string;
  resetUrl: string;
  serviceName: string;
  brandColor?: string | null;
  ttlSeconds: number;
  from?: string | null;
  devRedirectTo?: string | null;
}

export interface AccountDeactivatedEmailParams {
  to: string;
  serviceName: string;
  from?: string | null;
  devRedirectTo?: string | null;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private readonly smtp: SmtpConfig;
  private readonly isDev: boolean;

  constructor(private readonly config: ConfigService) {
    this.smtp = this.config.get<SmtpConfig>('app.smtp') ?? {
      host: '',
      port: 587,
      secure: false,
      user: '',
      pass: '',
      tlsRejectUnauthorized: true,
    };
    this.isDev = (this.config.get<string>('app.nodeEnv') ?? 'development') === 'development';
  }

  /**
   * 실제 발송할 수신자를 결정한다.
   * 개발환경(NODE_ENV=development)에서 테넌트의 mailDevRedirectTo가 설정된 경우,
   * 원래 수신자 대신 해당 주소로 강제 변경한다(실 사용자에게 잘못 발송되는 것을 방지).
   */
  private resolveRecipient(to: string, devRedirectTo?: string | null): string {
    if (this.isDev && devRedirectTo) {
      this.logger.log(`개발환경 메일 리디렉션: 원래 수신자=${to} → 강제 수신자=${devRedirectTo}`);
      return devRedirectTo;
    }
    return to;
  }

  /** SMTP_HOST 설정 여부. 미설정 시 메일을 보내지 않는다(개발용 폴백). */
  get isConfigured(): boolean {
    return !!this.smtp.host;
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: this.smtp.host,
        port: this.smtp.port,
        secure: this.smtp.secure,
        auth: this.smtp.user ? { user: this.smtp.user, pass: this.smtp.pass } : undefined,
        tls: { rejectUnauthorized: this.smtp.tlsRejectUnauthorized },
      });
    }
    return this.transporter;
  }

  async sendVerificationEmail(params: VerificationEmailParams): Promise<void> {
    const subject = `[${params.serviceName}] 이메일 인증을 완료해 주세요`;
    const html = this.renderVerificationHtml(params);

    if (!this.isConfigured) {
      this.logger.warn(
        `SMTP 미설정 — 인증 메일을 발송하지 않습니다. to=${params.to} link=${params.verifyUrl}`,
      );
      return;
    }

    const recipient = this.resolveRecipient(params.to, params.devRedirectTo);

    try {
      await this.getTransporter().sendMail({
        from: params.from || DEFAULT_MAIL_FROM,
        to: recipient,
        subject,
        html,
      });
    } catch (error) {
      this.logger.error(`인증 메일 발송 실패 to=${recipient}: ${(error as Error).message}`);
      throw error;
    }
  }

  async sendPasswordResetEmail(params: PasswordResetEmailParams): Promise<void> {
    const subject = `[${params.serviceName}] 비밀번호 재설정 안내`;
    const html = this.renderPasswordResetHtml(params);

    if (!this.isConfigured) {
      this.logger.warn(
        `SMTP 미설정 — 재설정 메일을 발송하지 않습니다. to=${params.to} link=${params.resetUrl}`,
      );
      return;
    }

    const recipient = this.resolveRecipient(params.to, params.devRedirectTo);
    try {
      await this.getTransporter().sendMail({
        from: params.from || DEFAULT_MAIL_FROM,
        to: recipient,
        subject,
        html,
      });
    } catch (error) {
      this.logger.error(`재설정 메일 발송 실패 to=${recipient}: ${(error as Error).message}`);
      throw error;
    }
  }

  async sendAccountDeactivatedEmail(params: AccountDeactivatedEmailParams): Promise<void> {
    const subject = `[${params.serviceName}] 계정 비활성화 안내`;
    const html = this.renderAccountDeactivatedHtml(params);

    if (!this.isConfigured) {
      this.logger.warn(`SMTP 미설정 — 비활성화 안내 메일을 발송하지 않습니다. to=${params.to}`);
      return;
    }

    const recipient = this.resolveRecipient(params.to, params.devRedirectTo);
    try {
      await this.getTransporter().sendMail({
        from: params.from || DEFAULT_MAIL_FROM,
        to: recipient,
        subject,
        html,
      });
    } catch (error) {
      this.logger.error(
        `비활성화 안내 메일 발송 실패 to=${recipient}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  private renderVerificationHtml(params: VerificationEmailParams): string {
    const color = params.brandColor || '#4f46e5';
    const hours = Math.round(params.ttlSeconds / 3600);
    const safeUrl = this.escapeHtml(params.verifyUrl);
    const safeName = this.escapeHtml(params.serviceName);
    return `<!DOCTYPE html>
<html lang="ko">
  <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 16px 32px;">
                <h1 style="margin:0 0 8px 0;font-size:20px;font-weight:700;color:#111827;">${safeName}</h1>
                <h2 style="margin:0;font-size:16px;font-weight:600;color:#374151;">이메일 인증</h2>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px 32px;">
                <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#4b5563;">
                  회원가입을 완료하려면 아래 버튼을 클릭해 이메일 주소를 인증해 주세요.
                  이 링크는 ${hours}시간 동안 유효합니다.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
                  <tr>
                    <td style="border-radius:8px;background-color:${color};">
                      <a href="${safeUrl}" target="_blank"
                         style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                        이메일 인증하기
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px 0;font-size:12px;color:#9ca3af;">
                  버튼이 동작하지 않으면 아래 주소를 브라우저에 붙여넣어 주세요.
                </p>
                <p style="margin:0;font-size:12px;color:#6b7280;word-break:break-all;">
                  <a href="${safeUrl}" target="_blank" style="color:${color};">${safeUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
                <p style="margin:0;font-size:12px;color:#9ca3af;">
                  본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  private renderPasswordResetHtml(params: PasswordResetEmailParams): string {
    const color = params.brandColor || '#4f46e5';
    const hours = Math.round(params.ttlSeconds / 3600);
    const safeUrl = this.escapeHtml(params.resetUrl);
    const safeName = this.escapeHtml(params.serviceName);
    return `<!DOCTYPE html>
<html lang="ko"><body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 0;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
      <tr><td style="padding:32px 32px 16px;"><h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">${safeName}</h1><h2 style="margin:0;font-size:16px;font-weight:600;color:#374151;">비밀번호 재설정</h2></td></tr>
      <tr><td style="padding:0 32px 24px;">
        <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#4b5563;">아래 버튼을 클릭해 새 비밀번호를 설정해 주세요. 이 링크는 ${hours}시간 동안 유효합니다.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td style="border-radius:8px;background:${color};">
          <a href="${safeUrl}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#fff;text-decoration:none;border-radius:8px;">비밀번호 재설정</a>
        </td></tr></table>
        <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;">버튼이 동작하지 않으면 아래 주소를 브라우저에 붙여넣어 주세요.</p>
        <p style="margin:0;font-size:12px;color:#6b7280;word-break:break-all;"><a href="${safeUrl}" target="_blank" style="color:${color};">${safeUrl}</a></p>
      </td></tr>
      <tr><td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:12px;color:#9ca3af;">본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  }

  private renderAccountDeactivatedHtml(params: AccountDeactivatedEmailParams): string {
    const safeName = this.escapeHtml(params.serviceName);
    return `<!DOCTYPE html>
<html lang="ko"><body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 0;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
      <tr><td style="padding:32px 32px 16px;"><h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">${safeName}</h1><h2 style="margin:0;font-size:16px;font-weight:600;color:#374151;">계정 비활성화 안내</h2></td></tr>
      <tr><td style="padding:0 32px 24px;"><p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;">요청에 따라 계정이 비활성화되었습니다. 일정 유예기간이 지나면 계정과 관련 데이터가 삭제됩니다. 계정을 다시 사용하려면 서비스 제공자에게 문의해 주세요.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
