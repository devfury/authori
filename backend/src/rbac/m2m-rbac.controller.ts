import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuditService } from '../common/audit/audit.service';
import { RequireScopes } from '../common/decorators/require-scopes.decorator';
import { OAuthAccessTokenGuard } from '../common/guards/oauth-access-token.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { TenantContext } from '../common/tenant/tenant-context';
import { AuditAction } from '../database/entities';
import { SetUserRolesDto } from './dto/set-user-roles.dto';
import { RbacService } from './rbac.service';

@ApiTags('M2M / RBAC')
@ApiBearerAuth()
@ApiParam({ name: 'tenantSlug', description: '테넌트 슬러그' })
@UseGuards(OAuthAccessTokenGuard, ScopeGuard)
@Controller('t/:tenantSlug/api')
export class M2mRbacController {
  constructor(
    private readonly rbacService: RbacService,
    private readonly auditService: AuditService,
  ) {}

  @Get('roles')
  @RequireScopes('rbac:read')
  @ApiOperation({ summary: 'M2M 역할 목록 조회' })
  findRoles(@CurrentTenant() tenant: TenantContext) {
    return this.rbacService.findRoles(tenant.tenantId);
  }

  @Get('users/:userId/roles')
  @RequireScopes('rbac:read')
  @ApiOperation({ summary: 'M2M 사용자 역할 조회' })
  findUserRoles(
    @CurrentTenant() tenant: TenantContext,
    @Param('userId') userId: string,
  ) {
    return this.rbacService.findUserRoles(tenant.tenantId, userId);
  }

  @Post('users/:userId/roles/:roleId')
  @HttpCode(HttpStatus.OK)
  @RequireScopes('rbac:write')
  @ApiOperation({ summary: 'M2M 사용자 역할 추가' })
  async addUserRole(
    @CurrentTenant() tenant: TenantContext,
    @Param('userId') userId: string,
    @Param('roleId') roleId: string,
    @Req() req: Request,
  ) {
    const roles = await this.rbacService.addUserRole(
      tenant.tenantId,
      userId,
      roleId,
    );
    await this.recordRoleAudit(req, tenant.tenantId, userId, roleId, 'add');
    return roles;
  }

  @Delete('users/:userId/roles/:roleId')
  @HttpCode(HttpStatus.OK)
  @RequireScopes('rbac:write')
  @ApiOperation({ summary: 'M2M 사용자 역할 제거' })
  async removeUserRole(
    @CurrentTenant() tenant: TenantContext,
    @Param('userId') userId: string,
    @Param('roleId') roleId: string,
    @Req() req: Request,
  ) {
    const roles = await this.rbacService.removeUserRole(
      tenant.tenantId,
      userId,
      roleId,
    );
    await this.recordRoleAudit(req, tenant.tenantId, userId, roleId, 'remove');
    return roles;
  }

  @Put('users/:userId/roles')
  @RequireScopes('rbac:write')
  @ApiOperation({ summary: 'M2M 사용자 역할 전체 교체' })
  async setUserRoles(
    @CurrentTenant() tenant: TenantContext,
    @Param('userId') userId: string,
    @Body() dto: SetUserRolesDto,
    @Req() req: Request,
  ) {
    const roles = await this.rbacService.setUserRoles(
      tenant.tenantId,
      userId,
      dto.roleIds,
    );
    await this.recordRoleAudit(
      req,
      tenant.tenantId,
      userId,
      undefined,
      'replace',
      { roleIds: dto.roleIds },
    );
    return roles;
  }

  private recordRoleAudit(
    req: Request,
    tenantId: string,
    userId: string,
    roleId: string | undefined,
    operation: 'add' | 'remove' | 'replace',
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    return this.auditService.record({
      tenantId,
      actorId: req.accessToken?.sub ?? null,
      actorType: 'oauth_client',
      action: AuditAction.USER_UPDATED,
      targetType: 'user_role',
      targetId: userId,
      metadata: { operation, roleId, ...metadata },
      ipAddress: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string) ?? null,
      requestId: req.requestId ?? null,
    });
  }
}
