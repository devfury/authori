import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { AuthRequestDto } from './dto/auth-request.dto';

export interface ExternalAuthResult {
  authenticated: boolean;
  reason?: string;
  error?: 'timeout' | 'network' | 'server_error';
  user?: {
    email: string;
    name?: string;
    loginId?: string;
    profile?: Record<string, unknown>;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly usersService: UsersService) {}

  async authenticate(dto: AuthRequestDto): Promise<ExternalAuthResult> {
    // simulate:server_error — HTTP 500 반환 (Authori가 server_error로 감지 후 로컬 폴백)
    if (dto.password === 'simulate:server_error') {
      this.logger.warn(`[simulate] server_error for ${dto.email}`);
      throw new InternalServerErrorException('Simulated server error');
    }

    // simulate:timeout — 10초 지연 (Authori 5초 타임아웃 유발 → timeout 감지 후 로컬 폴백)
    if (dto.password === 'simulate:timeout') {
      this.logger.warn(`[simulate] timeout for ${dto.email} — sleeping 10s`);
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      return { authenticated: false, reason: 'timeout_simulated' };
    }

    const user = this.usersService.findByEmail(dto.email);

    if (!user) {
      this.logger.log(`Auth failed: user not found — ${dto.email}`);
      return { authenticated: false, reason: 'user_not_found' };
    }

    if (user.password !== dto.password) {
      this.logger.log(`Auth failed: invalid password — ${dto.email}`);
      return { authenticated: false, reason: 'invalid_password' };
    }

    this.logger.log(`Auth success — ${dto.email}`);
    return {
      authenticated: true,
      user: {
        email: user.email,
        name: user.name,
        loginId: user.loginId,
        profile: user.profile,
      },
    };
  }
}
