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
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExternalAuthService } from './external-auth.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { TenantAdminGuard } from '../admin/guards/tenant-admin.guard';

@ApiTags('Admin / External Auth')
@Controller('admin/tenants/:tenantId/external-auth')
@UseGuards(TenantAdminGuard)
export class ExternalAuthController {
  constructor(private readonly externalAuthService: ExternalAuthService) {}

  @Post()
  @ApiOperation({ summary: '외부 인증 프로바이더 생성' })
  create(@Param('tenantId') tenantId: string, @Body() dto: CreateProviderDto) {
    return this.externalAuthService.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: '외부 인증 프로바이더 목록' })
  findAll(@Param('tenantId') tenantId: string) {
    return this.externalAuthService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: '외부 인증 프로바이더 상세' })
  findOne(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.externalAuthService.findOne(tenantId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '외부 인증 프로바이더 수정' })
  update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProviderDto,
  ) {
    return this.externalAuthService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '외부 인증 프로바이더 삭제' })
  remove(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.externalAuthService.remove(tenantId, id);
  }
}
