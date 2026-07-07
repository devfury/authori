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
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { PlatformAdminGuard } from '../admin/guards/platform-admin.guard';
import { TenantStatus } from '../database/entities';

@ApiTags('Admin / Tenants')
@ApiBearerAuth()
@UseGuards(PlatformAdminGuard)
@Controller('admin/tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @ApiOperation({ summary: '테넌트 생성' })
  create(@Body() dto: CreateTenantDto, @Req() req: Request) {
    return this.tenantsService.create(dto, {
      actorId: req.admin?.sub ?? null,
      actorType: req.admin ? 'admin' : null,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      requestId: (req.headers['x-request-id'] as string) ?? null,
    });
  }

  @Get()
  @ApiOperation({ summary: '테넌트 목록 조회' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '페이지 번호' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '페이지당 건수' })
  @ApiQuery({ name: 'search', required: false, type: String, description: '이름 또는 슬러그 검색' })
  @ApiQuery({ name: 'status', required: false, enum: TenantStatus, description: '상태 필터' })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: TenantStatus,
  ) {
    return this.tenantsService.findAll({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search: search || undefined,
      status: status || undefined,
    });
  }

  /**
   * 개발용 강제 수신자(mailDevRedirectTo)는 production에서 편집 불가.
   * 프론트가 입력 노출 여부를 판단할 수 있도록 서버 NODE_ENV 기준 플래그를 병합해 내려준다.
   * 조회·수정 응답 모두 동일한 shape를 유지해야 저장 직후에도 플래그가 유실되지 않는다.
   */
  private withEnvFlags<T>(tenant: T): T & { mailDevRedirectEditable: boolean } {
    return {
      ...tenant,
      mailDevRedirectEditable: this.config.get<string>('app.nodeEnv') !== 'production',
    };
  }

  @Get(':id')
  @ApiOperation({ summary: '테넌트 단건 조회' })
  async findOne(@Param('id') id: string) {
    return this.withEnvFlags(await this.tenantsService.findOne(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: '테넌트 수정' })
  async update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.withEnvFlags(await this.tenantsService.update(id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '테넌트 영구 삭제' })
  deletePermanently(@Param('id') id: string, @Req() req: Request) {
    return this.tenantsService.deletePermanently(id, {
      actorId: req.admin?.sub ?? null,
      actorType: req.admin ? 'admin' : null,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      requestId: (req.headers['x-request-id'] as string) ?? null,
    });
  }
}
