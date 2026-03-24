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
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { PlatformAdminGuard } from '../admin/guards/platform-admin.guard';

@ApiTags('Admin / Tenants')
@ApiBearerAuth()
@UseGuards(PlatformAdminGuard)
@Controller('admin/tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @ApiOperation({ summary: '테넌트 생성' })
  create(@Body() dto: CreateTenantDto, @Req() req: Request) {
    return this.tenantsService.create(dto, {
      actorId: req.admin?.sub ?? null,
      actorType: req.admin ? 'admin' : null,
      ipAddress: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string) ?? null,
      requestId: (req.headers['x-request-id'] as string) ?? null,
    });
  }

  @Get()
  @ApiOperation({ summary: '테넌트 목록 조회' })
  findAll() {
    return this.tenantsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: '테넌트 단건 조회' })
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '테넌트 수정' })
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '테넌트 비활성화' })
  deactivate(@Param('id') id: string) {
    return this.tenantsService.deactivate(id);
  }
}
