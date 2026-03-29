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
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { TenantAdminGuard } from '../../admin/guards/tenant-admin.guard';
import { ClientStatus } from '../../database/entities';

@ApiTags('Admin / OAuth Clients')
@ApiBearerAuth()
@UseGuards(TenantAdminGuard)
@Controller('admin/tenants/:tenantId/clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @ApiOperation({ summary: 'OAuth 클라이언트 등록' })
  create(@Param('tenantId') tenantId: string, @Body() dto: CreateClientDto, @Req() req: Request) {
    return this.clientsService.create(tenantId, dto, {
      actorId: req.admin?.sub ?? null,
      actorType: req.admin ? 'admin' : null,
      ipAddress: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string) ?? null,
      requestId: (req.headers['x-request-id'] as string) ?? null,
    });
  }

  @Get()
  @ApiOperation({ summary: '클라이언트 목록 조회' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '페이지 번호 (1-based, 기본값: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '페이지당 건수 (기본값: 20, 최대: 100)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: '이름 또는 clientId 부분 검색' })
  @ApiQuery({ name: 'status', required: false, enum: ClientStatus, description: '상태 필터' })
  findAll(
    @Param('tenantId') tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: ClientStatus,
  ) {
    return this.clientsService.findAll(tenantId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search: search || undefined,
      status: status || undefined,
    });
  }

  @Get(':clientId')
  @ApiOperation({ summary: '클라이언트 단건 조회' })
  findOne(@Param('tenantId') tenantId: string, @Param('clientId') clientId: string) {
    return this.clientsService.findOne(tenantId, clientId);
  }

  @Patch(':clientId')
  @ApiOperation({ summary: '클라이언트 수정' })
  update(
    @Param('tenantId') tenantId: string,
    @Param('clientId') clientId: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientsService.update(tenantId, clientId, dto);
  }

  @Post(':clientId/rotate-secret')
  @ApiOperation({ summary: '클라이언트 시크릿 rotation' })
  rotateSecret(
    @Param('tenantId') tenantId: string,
    @Param('clientId') clientId: string,
    @Req() req: Request,
  ) {
    return this.clientsService.rotateSecret(tenantId, clientId, {
      actorId: req.admin?.sub ?? null,
      actorType: req.admin ? 'admin' : null,
      ipAddress: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string) ?? null,
      requestId: (req.headers['x-request-id'] as string) ?? null,
    });
  }

  @Delete(':clientId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '클라이언트 비활성화' })
  deactivate(@Param('tenantId') tenantId: string, @Param('clientId') clientId: string) {
    return this.clientsService.deactivate(tenantId, clientId);
  }
}
