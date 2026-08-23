import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface EzariaConfig {
  /** 봇 토큰. 비밀정보이므로 로그·응답에 노출하지 않는다. */
  botToken: string;
  /** 전송 엔드포인트 base URL (토큰 앞부분까지) */
  baseUrl: string;
  timeoutMs: number;
}

/** 오류 메시지에 담을 응답 본문 최대 길이 */
const MAX_ERROR_BODY = 200;

/**
 * ezAria 봇 API 전송 클라이언트.
 *
 *   POST {baseUrl}/{botToken}
 *   { "chatRoomId": "...", "content": "..." }
 *
 * 외부 HTTP 호출을 이 클래스 하나로 좁혀 상위 서비스 테스트에서 모킹할 수 있게 한다.
 */
@Injectable()
export class EzariaClient {
  private readonly logger = new Logger(EzariaClient.name);
  private readonly cfg: EzariaConfig;

  constructor(config: ConfigService) {
    this.cfg = config.get<EzariaConfig>('app.ezaria') ?? {
      botToken: '',
      baseUrl: '',
      timeoutMs: 5000,
    };
  }

  /** 봇 토큰 설정 여부. 미설정이면 알림을 발송하지 않는다(개발용 폴백). */
  get isConfigured(): boolean {
    return !!this.cfg.botToken && !!this.cfg.baseUrl;
  }

  /**
   * 채팅방으로 메시지를 발송한다. 실패 시 예외를 던지므로 호출자가 격리한다.
   * 로그에는 chatRoomId와 상태만 남기고 토큰이 포함된 URL은 절대 출력하지 않는다.
   */
  async send(chatRoomId: string, content: string): Promise<void> {
    if (!this.isConfigured) {
      throw new Error('ezaria_not_configured');
    }

    const url = `${this.cfg.baseUrl}/${this.cfg.botToken}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatRoomId, content }),
      signal: AbortSignal.timeout(this.cfg.timeoutMs),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `ezaria_send_failed status=${response.status} ${body.slice(0, MAX_ERROR_BODY)}`,
      );
    }

    this.logger.log(`ezAria 알림 발송 완료 chatRoomId=${chatRoomId}`);
  }
}
