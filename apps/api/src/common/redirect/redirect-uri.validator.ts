import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuthClientRedirectUri } from '../../database/entities';

/**
 * 인증 후 리다이렉트 목적지의 open redirect 방지 검증기.
 *
 * 후보 URL의 origin(scheme+host+port)이 해당 클라이언트에 등록된
 * redirect_uri 중 하나의 origin과 일치할 때만 허용한다. 경로까지 강제하지
 * 않는 이유는 BFF 로그인 경로/SPA 진입 경로가 OAuth callback 경로와 다를 수
 * 있기 때문이다(요구사항 FR-5).
 */
@Injectable()
export class RedirectUriValidator {
  constructor(
    @InjectRepository(OAuthClientRedirectUri)
    private readonly redirectUriRepo: Repository<OAuthClientRedirectUri>,
  ) {}

  /** 후보 URL이 clientId의 등록 redirect_uri origin allowlist에 속하면 true */
  async isAllowed(
    clientId: string | null | undefined,
    candidate: string | null | undefined,
  ): Promise<boolean> {
    if (!clientId || !candidate) return false;

    const candidateOrigin = this.safeOrigin(candidate);
    if (!candidateOrigin) return false;

    const registered = await this.redirectUriRepo.find({ where: { clientId } });
    return registered.some((r) => this.safeOrigin(r.uri) === candidateOrigin);
  }

  /** 파싱 실패 시 null. opaque origin('null')도 거부 */
  private safeOrigin(value: string): string | null {
    try {
      const origin = new URL(value).origin;
      return origin && origin !== 'null' ? origin : null;
    } catch {
      return null;
    }
  }
}
