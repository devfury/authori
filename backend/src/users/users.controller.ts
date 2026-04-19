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
      userAgent: (req.headers['user-agent'] as string) ?? null,
      requestId: (req.headers['x-request-id'] as string) ?? null,
    });
  }

  @Get()
  @ApiOperation({ summary: '사용자 목록 조회' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '페이지 번호 (1-based, 기본값: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '페이지당 건수 (기본값: 20, 최대: 100)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: '이메일 부분 검색' })
  @ApiQuery({ name: 'status', required: false, enum: UserStatus, description: '상태 필터' })
  findAll(
    @Param('tenantId') tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: UserStatus,
  ) {
    return this.usersService.findAll(tenantId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search: search || undefined,
      status: status || undefined,
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
      userAgent: (req.headers['user-agent'] as string) ?? null,
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
      userAgent: (req.headers['user-agent'] as string) ?? null,
      requestId: (req.headers['x-request-id'] as string) ?? null,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '사용자 비활성화' })
  deactivate(@Param('tenantId') tenantId: string, @Param('id') id: string, @Req() req: Request) {
    return this.usersService.deactivate(tenantId, id, {
      actorId: req.admin?.sub ?? null,
      actorType: req.admin ? 'admin' : null,
      ipAddress: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string) ?? null,
      requestId: (req.headers['x-request-id'] as string) ?? null,
    });
  }
}
