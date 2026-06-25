import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
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
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private readonly smtp: SmtpConfig;

  constructor(private readonly config: ConfigService) {
    this.smtp = this.config.get<SmtpConfig>('app.smtp') ?? {
      host: '',
      port: 587,
      secure: false,
      user: '',
      pass: '',
      from: 'Authori <no-reply@authori.local>',
    };
  }

  /** SMTP_HOST가 설정되지 않은 경우 메일을 보내지 않고 로그만 남긴다 (개발용 폴백) */
  private get configured(): boolean {
    return !!this.smtp.host;
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: this.smtp.host,
        port: this.smtp.port,
        secure: this.smtp.secure,
        auth: this.smtp.user ? { user: this.smtp.user, pass: this.smtp.pass } : undefined,
      });
    }
    return this.transporter;
  }

  async sendVerificationEmail(params: VerificationEmailParams): Promise<void> {
    const subject = `[${params.serviceName}] 이메일 인증을 완료해 주세요`;
    const html = this.renderVerificationHtml(params);

    if (!this.configured) {
      this.logger.warn(
        `SMTP 미설정 — 인증 메일을 발송하지 않습니다. to=${params.to} link=${params.verifyUrl}`,
      );
      return;
    }

    try {
      await this.getTransporter().sendMail({
        from: this.smtp.from,
        to: params.to,
        subject,
        html,
      });
    } catch (error) {
      this.logger.error(`인증 메일 발송 실패 to=${params.to}: ${(error as Error).message}`);
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

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
