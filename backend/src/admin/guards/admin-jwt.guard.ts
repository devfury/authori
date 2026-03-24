import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import type { AdminJwtPayload } from '../auth/admin-auth.service';

declare module 'express' {
  interface Request {
    admin?: AdminJwtPayload;
  }
}

@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Admin token required');
    }

    const token = authHeader.slice(7);
    try {
      const payload = this.jwtService.verify<AdminJwtPayload>(token);
      if (payload.type !== 'admin') throw new Error();
      request.admin = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired admin token');
    }
  }
}
