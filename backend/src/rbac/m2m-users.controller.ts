import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { RequireScopes } from '../common/decorators/require-scopes.decorator';
import { OAuthAccessTokenGuard } from '../common/guards/oauth-access-token.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { TenantContext } from '../common/tenant/tenant-context';
import { UserStatus } from '../database/entities';
import { UsersService } from '../users/users.service';

@ApiTags('M2M / Users')
@ApiBearerAuth()
@ApiParam({ name: 'tenantSlug', description: '테넌트 슬러그' })
@UseGuards(OAuthAccessTokenGuard, ScopeGuard)
@Controller('t/:tenantSlug/api')
export class M2mUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('users')
  @RequireScopes('users:read')
  @ApiOperation({ summary: 'M2M 사용자 목록 조회 (역할·상태 포함, 페이징)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '페이지 번호 (1-based, 기본값: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '페이지당 건수 (기본값: 20, 최대: 100)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: '이메일 부분 검색' })
  @ApiQuery({ name: 'status', required: false, enum: UserStatus, description: '상태 필터' })
  listUsers(
    @CurrentTenant() tenant: TenantContext,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: UserStatus,
  ) {
    return this.usersService.findAll(tenant.tenantId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search: search || undefined,
      status: status || undefined,
    });
  }

  @Post('users/:userId/activate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireScopes('users:write')
  @ApiOperation({ summary: 'M2M 사용자 활성화' })
  activateUser(
    @CurrentTenant() tenant: TenantContext,
    @Param('userId') userId: string,
    @Req() req: Request,
  ) {
    return this.usersService.activate(tenant.tenantId, userId, this.buildCtx(req));
  }

  @Post('users/:userId/deactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireScopes('users:write')
  @ApiOperation({ summary: 'M2M 사용자 비활성화' })
  deactivateUser(
    @CurrentTenant() tenant: TenantContext,
    @Param('userId') userId: string,
    @Req() req: Request,
  ) {
    return this.usersService.deactivate(tenant.tenantId, userId, this.buildCtx(req));
  }

  @Post('users/:userId/lock')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireScopes('users:write')
  @ApiOperation({ summary: 'M2M 계정 잠금' })
  lockUser(
    @CurrentTenant() tenant: TenantContext,
    @Param('userId') userId: string,
    @Req() req: Request,
  ) {
    return this.usersService.lock(tenant.tenantId, userId, this.buildCtx(req));
  }

  @Post('users/:userId/unlock')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireScopes('users:write')
  @ApiOperation({ summary: 'M2M 계정 잠금 해제' })
  unlockUser(
    @CurrentTenant() tenant: TenantContext,
    @Param('userId') userId: string,
    @Req() req: Request,
  ) {
    return this.usersService.unlock(tenant.tenantId, userId, this.buildCtx(req));
  }

  private buildCtx(req: Request) {
    return {
      actorId: req.accessToken?.sub ?? null,
      actorType: 'oauth_client' as const,
      ipAddress: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string) ?? null,
      requestId: req.requestId ?? null,
    };
  }
}
