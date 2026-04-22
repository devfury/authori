import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantAdminGuard } from '../admin/guards/tenant-admin.guard';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';
import { SetUserRolesDto } from './dto/set-user-roles.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RbacService } from './rbac.service';

@ApiTags('Admin / RBAC')
@ApiBearerAuth()
@UseGuards(TenantAdminGuard)
@Controller('admin/tenants/:tenantId')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('roles')
  @ApiOperation({ summary: '역할 목록 조회' })
  findRoles(@Param('tenantId') tenantId: string) {
    return this.rbacService.findRoles(tenantId);
  }

  @Post('roles')
  @ApiOperation({ summary: '역할 생성' })
  createRole(@Param('tenantId') tenantId: string, @Body() dto: CreateRoleDto) {
    return this.rbacService.createRole(tenantId, dto);
  }

  @Patch('roles/:id')
  @ApiOperation({ summary: '역할 수정' })
  updateRole(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rbacService.updateRole(tenantId, id, dto);
  }

  @Delete('roles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '역할 삭제' })
  removeRole(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.rbacService.removeRole(tenantId, id);
  }

  @Get('roles/:id/permissions')
  @ApiOperation({ summary: '역할 권한 조회' })
  async getRolePermissions(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    const role = await this.rbacService.findRole(tenantId, id);
    return role.rolePermissions.map((rp) => rp.permission);
  }

  @Put('roles/:id/permissions')
  @ApiOperation({ summary: '역할 권한 일괄 설정' })
  setRolePermissions(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: SetRolePermissionsDto,
  ) {
    return this.rbacService.setRolePermissions(
      tenantId,
      id,
      dto.permissionIds,
    );
  }

  @Get('permissions')
  @ApiOperation({ summary: '권한 목록 조회' })
  findPermissions(@Param('tenantId') tenantId: string) {
    return this.rbacService.findPermissions(tenantId);
  }

  @Post('permissions')
  @ApiOperation({ summary: '권한 생성' })
  createPermission(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreatePermissionDto,
  ) {
    return this.rbacService.createPermission(tenantId, dto);
  }

  @Patch('permissions/:id')
  @ApiOperation({ summary: '권한 수정' })
  updatePermission(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePermissionDto,
  ) {
    return this.rbacService.updatePermission(tenantId, id, dto);
  }

  @Delete('permissions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '권한 삭제' })
  removePermission(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.rbacService.removePermission(tenantId, id);
  }

  @Get('users/:userId/roles')
  @ApiOperation({ summary: '사용자 역할 조회' })
  findUserRoles(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
  ) {
    return this.rbacService.findUserRoles(tenantId, userId);
  }

  @Put('users/:userId/roles')
  @ApiOperation({ summary: '사용자 역할 일괄 설정' })
  setUserRoles(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @Body() dto: SetUserRolesDto,
  ) {
    return this.rbacService.setUserRoles(tenantId, userId, dto.roleIds);
  }
}
