import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createPublicKey } from 'crypto';
import type { Request } from 'express';
import { verify } from 'jsonwebtoken';
import { Repository } from 'typeorm';
import { AccessToken } from '../../database/entities';
import { KeysService } from '../../oauth/keys/keys.service';

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

declare module 'express' {
  interface Request {
    accessToken?: OAuthAccessTokenPayload;
  }
}

@Injectable()
export class OAuthAccessTokenGuard implements CanActivate {
  constructor(
    private readonly keysService: KeysService,
    @InjectRepository(AccessToken)
    private readonly accessTokenRepo: Repository<AccessToken>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer token required');
    }
    if (!request.tenantContext) {
      throw new UnauthorizedException('Tenant context is required');
    }

    const rawToken = authHeader.slice(7);
    const payload = await this.verifyJwt(rawToken);
    if (!payload.jti || !payload.sub || !payload.tenant_id) {
      throw new UnauthorizedException('invalid_token');
    }
    if (payload.tenant_id !== request.tenantContext.tenantId) {
      throw new UnauthorizedException('tenant_mismatch');
    }

    const tokenRecord = await this.accessTokenRepo.findOne({
      where: { tenantId: request.tenantContext.tenantId, jti: payload.jti },
    });
    if (
      !tokenRecord ||
      tokenRecord.revoked ||
      tokenRecord.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('token_revoked');
    }

    request.accessToken = payload;
    return true;
  }

  private async verifyJwt(rawToken: string): Promise<OAuthAccessTokenPayload> {
    const activeKey = await this.keysService.getActiveKey(null);
    try {
      const publicKey = createPublicKey(activeKey.publicKeyPem);
      return verify(rawToken, publicKey, {
        algorithms: ['RS256'],
      }) as OAuthAccessTokenPayload;
    } catch {
      throw new UnauthorizedException('invalid_token');
    }
  }
}
