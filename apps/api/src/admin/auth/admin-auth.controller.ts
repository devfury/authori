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
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { BootstrapAdminDto } from './dto/bootstrap-admin.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { PlatformAdminGuard } from '../guards/platform-admin.guard';
import { AdminJwtGuard } from '../guards/admin-jwt.guard';
import { AdminRole, AdminStatus } from '../../database/entities';

@ApiTags('Admin / Auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Get('bootstrap/status')
  @ApiOperation({ summary: '플랫폼 관리자 존재 여부 확인' })
  bootstrapStatus() {
    return this.adminAuthService.isBootstrapNeeded();
  }

  @Post('bootstrap')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary: '최초 플랫폼 관리자 생성',
    description:
      'PLATFORM_ADMIN_SECRET을 사용해 최초 플랫폼 관리자를 생성한다. 이미 존재하면 409 반환.',
  })
  bootstrap(@Body() dto: BootstrapAdminDto) {
    return this.adminAuthService.bootstrap(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: '관리자 로그인' })
  login(@Body() dto: AdminLoginDto) {
    return this.adminAuthService.login(dto);
  }

  @Get('me')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '현재 관리자 정보 조회',
    description: '접근 가능한 테넌트 목록을 포함한다. 배정은 토큰이 아니라 DB가 단일 진실이다.',
  })
  me(@Req() req: Request) {
    return this.adminAuthService.me(req.admin!.sub);
  }

  @Post('admins')
  @UseGuards(PlatformAdminGuard)
  @ApiOperation({ summary: '관리자 계정 생성 (PLATFORM_ADMIN 전용)' })
  createAdmin(@Body() dto: CreateAdminDto) {
    return this.adminAuthService.createAdmin(dto);
  }

  @Get('admins')
  @UseGuards(PlatformAdminGuard)
  @ApiOperation({ summary: '관리자 목록 조회 (PLATFORM_ADMIN 전용)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '페이지 번호' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '페이지당 건수' })
  @ApiQuery({ name: 'search', required: false, type: String, description: '이름 또는 이메일 검색' })
  @ApiQuery({ name: 'status', required: false, enum: AdminStatus, description: '상태 필터' })
  @ApiQuery({ name: 'role', required: false, enum: AdminRole, description: '역할 필터' })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: AdminStatus,
    @Query('role') role?: AdminRole,
  ) {
    return this.adminAuthService.findAll({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search: search || undefined,
      status: status || undefined,
      role: role || undefined,
    });
  }

  @Patch('admins/:id')
  @UseGuards(PlatformAdminGuard)
  @ApiOperation({ summary: '관리자 계정 수정 (PLATFORM_ADMIN 전용)' })
  updateAdmin(@Param('id') id: string, @Body() dto: UpdateAdminDto) {
    return this.adminAuthService.updateAdmin(id, dto);
  }

  @Delete('admins/:id')
  @UseGuards(PlatformAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '관리자 비활성화 (PLATFORM_ADMIN 전용)' })
  deactivate(@Param('id') id: string) {
    return this.adminAuthService.deactivate(id);
  }
}
