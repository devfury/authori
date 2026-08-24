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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { TenantAdminGuard } from '../admin/guards/tenant-admin.guard';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { HoldUserDto } from './dto/hold-user.dto';
import { BulkActivateUsersDto, BulkHoldUsersDto } from './dto/bulk-users.dto';
import { UserStatus } from '../database/entities';

@ApiTags('Admin / Users')
@ApiBearerAuth()
@UseGuards(TenantAdminGuard)
@Controller('admin/tenants/:tenantId/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: '사용자 생성' })
  create(@Param('tenantId') tenantId: string, @Body() dto: CreateUserDto, @Req() req: Request) {
    return this.usersService.create(tenantId, dto, {
      actorId: req.admin?.sub ?? null,
      actorType: req.admin ? 'admin' : null,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      requestId: (req.headers['x-request-id'] as string) ?? null,
    });
  }

  // bulk 라우트는 ':id/...' 라우트보다 먼저 선언해야 한다. 뒤에 두면 'bulk'가 :id로 매칭된다.
  @Post('bulk/activate')
  @ApiOperation({ summary: '사용자 일괄 승인(활성화) — 건별 부분 성공' })
  bulkActivate(
    @Param('tenantId') tenantId: string,
    @Body() dto: BulkActivateUsersDto,
    @Req() req: Request,
  ) {
    return this.usersService.bulkActivate(tenantId, dto.userIds, {
      actorId: req.admin?.sub ?? null,
      actorType: req.admin ? 'admin' : null,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      requestId: (req.headers['x-request-id'] as string) ?? null,
    });
  }

  @Post('bulk/hold')
  @ApiOperation({ summary: '사용자 일괄 가입 보류 — 건별 부분 성공' })
  bulkHold(
    @Param('tenantId') tenantId: string,
    @Body() dto: BulkHoldUsersDto,
    @Req() req: Request,
  ) {
    return this.usersService.bulkHold(tenantId, dto.userIds, dto.reason ?? null, {
      actorId: req.admin?.sub ?? null,
      actorType: req.admin ? 'admin' : null,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      requestId: (req.headers['x-request-id'] as string) ?? null,
    });
  }

  @Get()
  @ApiOperation({ summary: '사용자 목록 조회' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: '페이지 번호 (1-based, 기본값: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: '페이지당 건수 (기본값: 20, 최대: 100)',
  })
  @ApiQuery({ name: 'search', required: false, type: String, description: '이메일 부분 검색' })
  @ApiQuery({ name: 'status', required: false, enum: UserStatus, description: '상태 필터' })
  @ApiQuery({
    name: 'pending',
    required: false,
    type: Boolean,
    description: 'true면 관리자 승인 대기 사용자만 (status보다 우선)',
  })
  findAll(
    @Param('tenantId') tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: UserStatus,
    @Query('pending') pending?: string,
  ) {
    return this.usersService.findAll(tenantId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search: search || undefined,
      status: status || undefined,
      pending: pending === 'true',
    });
  }

  @Get(':id')
  @ApiOperation({ summary: '사용자 단건 조회' })
  findOne(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.usersService.findOne(tenantId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '사용자 수정' })
  update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: Request,
  ) {
    return this.usersService.update(tenantId, id, dto, {
      actorId: req.admin?.sub ?? null,
      actorType: req.admin ? 'admin' : null,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      requestId: (req.headers['x-request-id'] as string) ?? null,
    });
  }

  @Post(':id/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '비밀번호 변경 (관리자)' })
  changePassword(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    return this.usersService.changePassword(tenantId, id, dto.password, {
      actorId: req.admin?.sub ?? null,
      actorType: req.admin ? 'admin' : null,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      requestId: (req.headers['x-request-id'] as string) ?? null,
    });
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '사용자 활성화' })
  activate(@Param('tenantId') tenantId: string, @Param('id') id: string, @Req() req: Request) {
    return this.usersService.activate(tenantId, id, {
      actorId: req.admin?.sub ?? null,
      actorType: req.admin ? 'admin' : null,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      requestId: (req.headers['x-request-id'] as string) ?? null,
    });
  }

  @Post(':id/hold')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '가입 승인 보류 (승인 대기 사용자만)' })
  hold(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: HoldUserDto,
    @Req() req: Request,
  ) {
    return this.usersService.hold(tenantId, id, dto.reason ?? null, {
      actorId: req.admin?.sub ?? null,
      actorType: req.admin ? 'admin' : null,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      requestId: (req.headers['x-request-id'] as string) ?? null,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '사용자 영구 삭제' })
  remove(@Param('tenantId') tenantId: string, @Param('id') id: string, @Req() req: Request) {
    return this.usersService.delete(tenantId, id, {
      actorId: req.admin?.sub ?? null,
      actorType: req.admin ? 'admin' : null,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      requestId: (req.headers['x-request-id'] as string) ?? null,
    });
  }
}
