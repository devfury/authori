import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Ip,
  Patch,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { User, UserProfile } from '../../database/entities';
import { UsersService } from '../../users/users.service';
import { SelfUpdateUserDto } from '../../users/dto/self-update-user.dto';
import { RequireTenantGuard } from '../../common/tenant/require-tenant.guard';
import { CurrentTenant } from '../../common/tenant/tenant.decorator';
import type { TenantContext } from '../../common/tenant/tenant-context';
import { OAuthTokenVerifierService } from '../token-verifier/oauth-token-verifier.service';

@ApiTags('OAuth2')
@ApiParam({ name: 'tenantSlug', description: '테넌트 슬러그' })
@Controller('t/:tenantSlug')
export class UserInfoController {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
    private readonly usersService: UsersService,
    private readonly tokenVerifier: OAuthTokenVerifierService,
  ) {}

  @Get('oauth/userinfo')
  @ApiBearerAuth()
  @UseGuards(RequireTenantGuard)
  @ApiOperation({ summary: 'UserInfo (Bearer 액세스 토큰 필요)' })
  async userinfo(@CurrentTenant() tenant: TenantContext, @Req() req: Request) {
    const { sub, scopes } = await this.verifyAccessToken(
      tenant.tenantId,
      req.headers['authorization'],
    );

    const user = await this.userRepo.findOne({
      where: { id: sub, tenantId: tenant.tenantId },
    });
    if (!user) throw new UnauthorizedException('user_not_found');

    const profile = await this.profileRepo.findOne({
      where: { userId: user.id },
    });

    const claims: Record<string, unknown> = {
      sub: user.id,
      tenant_id: tenant.tenantId,
    };
    if (scopes.has('email')) claims['email'] = user.email;
    if (scopes.has('profile') && profile) {
      Object.assign(claims, profile.profileJsonb);
    }

    return claims;
  }

  @Patch('oauth/userinfo')
  @ApiBearerAuth()
  @UseGuards(RequireTenantGuard)
  @ApiOperation({
    summary: '본인 프로필 수정 (profile:write scope 필요)',
  })
  async updateUserinfo(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: SelfUpdateUserDto,
    @Req() req: Request,
    @Ip() ip: string,
  ) {
    const { sub, scopes } = await this.verifyAccessToken(
      tenant.tenantId,
      req.headers['authorization'],
    );
    if (!scopes.has('profile:write')) {
      throw new ForbiddenException('insufficient_scope');
    }

    const saved = await this.usersService.updateSelf(tenant.tenantId, sub, dto, {
      actorId: sub,
      actorType: 'user',
      ipAddress: ip ?? null,
      userAgent: (req.headers['user-agent'] as string) ?? null,
      requestId: (req.headers['x-request-id'] as string) ?? null,
    });

    const profile = await this.profileRepo.findOne({
      where: { userId: saved.id },
    });

    return {
      sub: saved.id,
      loginId: saved.loginId,
      profile: profile?.profileJsonb ?? {},
    };
  }

  private async verifyAccessToken(
    tenantId: string,
    authHeader: string | undefined,
  ): Promise<{ sub: string; jti: string; scopes: Set<string> }> {
    const verified = await this.tokenVerifier.verifyBearer(tenantId, authHeader);
    return {
      sub: verified.sub,
      jti: verified.jti,
      scopes: new Set(verified.scopes),
    };
  }
}
