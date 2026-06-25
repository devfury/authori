import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createPublicKey } from 'crypto';
import { verify } from 'jsonwebtoken';
import { Repository } from 'typeorm';
import { AccessToken } from '../../database/entities';
import { KeysService } from '../keys/keys.service';
import { VerifyTokenResponseDto } from './dto/verify-token-response.dto';

export interface OAuthAccessTokenPayload {
  sub: string;
  client_id?: string;
  tenant_id: string;
  scope?: string;
  scopes?: string[];
  roles?: string[];
  permissions?: string[];
  jti: string;
}

@Injectable()
export class OAuthTokenVerifierService {
  constructor(
    private readonly keysService: KeysService,
    @InjectRepository(AccessToken)
    private readonly accessTokenRepo: Repository<AccessToken>,
  ) {}

  async verifyBearer(
    tenantId: string,
    authHeader: string | undefined,
  ): Promise<VerifyTokenResponseDto> {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer token required');
    }

    const payload = await this.verifyJwt(authHeader.slice(7), tenantId);
    if (!payload.jti || !payload.sub || !payload.tenant_id) {
      throw new UnauthorizedException('invalid_token');
    }
    if (payload.tenant_id !== tenantId) {
      throw new UnauthorizedException('tenant_mismatch');
    }

    const tokenRecord = await this.accessTokenRepo.findOne({
      where: { tenantId, jti: payload.jti },
    });
    if (!tokenRecord || tokenRecord.revoked || tokenRecord.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('token_revoked');
    }

    const scopes = this.resolveScopes(payload, tokenRecord);
    return {
      active: true,
      subjectType: tokenRecord.userId ? 'user' : 'client',
      sub: payload.sub,
      clientId: payload.client_id ?? tokenRecord.clientId,
      tenantId,
      scope: scopes.join(' '),
      scopes,
      jti: payload.jti,
      expiresAt: tokenRecord.expiresAt.toISOString(),
      roles: payload.roles,
      permissions: payload.permissions,
    };
  }

  private async verifyJwt(rawToken: string, tenantId: string): Promise<OAuthAccessTokenPayload> {
    const activeKey = await this.keysService.getActiveKey(tenantId);
    try {
      const publicKey = createPublicKey(activeKey.publicKeyPem);
      return verify(rawToken, publicKey, {
        algorithms: ['RS256'],
      }) as OAuthAccessTokenPayload;
    } catch {
      throw new UnauthorizedException('invalid_token');
    }
  }

  private resolveScopes(payload: OAuthAccessTokenPayload, tokenRecord: AccessToken): string[] {
    if (Array.isArray(payload.scopes)) return payload.scopes;
    if (payload.scope) return payload.scope.split(' ').filter(Boolean);
    return tokenRecord.scopes ?? [];
  }
}
