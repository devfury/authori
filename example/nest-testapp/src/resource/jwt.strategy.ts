import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const authServerUrl = configService.get<string>('AUTH_SERVER_URL') ?? 'http://localhost:3000';
    const tenantSlug = configService.get<string>('TENANT_SLUG') ?? 'test';

    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${authServerUrl}/t/${tenantSlug}/.well-known/jwks.json`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      issuer: `${authServerUrl}/t/${tenantSlug}`,
      algorithms: ['RS256'],
    });
  }

  async validate(payload: any) {
    return payload;
  }
}
