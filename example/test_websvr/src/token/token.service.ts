import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RequestTokenDto } from './dto/request-token.dto';

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface DecodedToken {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  issuedAt?: string;
  expiresAt?: string;
}

@Injectable()
export class TokenService {
  constructor(private readonly config: ConfigService) {}

  async fetchClientCredentialsToken(dto: RequestTokenDto): Promise<TokenResponse> {
    const authServerUrl = dto.authServerUrl ?? 'http://localhost:3000';
    const tenantSlug = dto.tenantSlug ?? 'test';

    const url = `${authServerUrl}/t/${tenantSlug}/oauth/token`;

    const body = {
      grant_type: 'client_credentials',
      client_id: dto.clientId,
      client_secret: dto.clientSecret,
      ...(dto.scope ? { scope: dto.scope } : {}),
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new UnauthorizedException(err?.message ?? `Token request failed: ${res.status}`);
    }

    return res.json() as Promise<TokenResponse>;
  }

  decodeToken(token: string): DecodedToken {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('유효하지 않은 JWT 형식입니다.');
    }

    const decode = (part: string) =>
      JSON.parse(Buffer.from(part, 'base64url').toString('utf-8')) as Record<string, unknown>;

    const header = decode(parts[0]);
    const payload = decode(parts[1]);

    const result: DecodedToken = { header, payload };

    if (typeof payload.iat === 'number') {
      result.issuedAt = new Date(payload.iat * 1000).toISOString();
    }
    if (typeof payload.exp === 'number') {
      result.expiresAt = new Date(payload.exp * 1000).toISOString();
    }

    return result;
  }
}
