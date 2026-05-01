import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { REQUIRED_SCOPES_KEY } from '../decorators/require-scopes.decorator';

@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const tokenScopes = this.extractScopes(request.accessToken);
    return required.every((scope) => tokenScopes.has(scope));
  }

  private extractScopes(accessToken: Request['accessToken']): Set<string> {
    if (!accessToken) return new Set();
    if (Array.isArray(accessToken.scopes)) return new Set(accessToken.scopes);
    return new Set((accessToken.scope ?? '').split(' ').filter(Boolean));
  }
}
