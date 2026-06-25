import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { OAuthTokenVerifierService } from '../../oauth/token-verifier/oauth-token-verifier.service';

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
  constructor(private readonly tokenVerifier: OAuthTokenVerifierService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.tenantContext) {
      throw new UnauthorizedException('Tenant context is required');
    }

    const verified = await this.tokenVerifier.verifyBearer(
      request.tenantContext.tenantId,
      request.headers.authorization,
    );
    request.accessToken = {
      sub: verified.sub,
      client_id: verified.clientId,
      tenant_id: verified.tenantId,
      scope: verified.scope,
      scopes: verified.scopes,
      roles: verified.roles,
      permissions: verified.permissions,
      jti: verified.jti,
    };
    return true;
  }
}
