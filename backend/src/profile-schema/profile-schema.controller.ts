import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantAdminGuard } from '../admin/guards/tenant-admin.guard';
import { ProfileSchemaService } from './profile-schema.service';
import { CreateSchemaDto } from './dto/create-schema.dto';

@ApiTags('Admin / Profile Schemas')
@ApiBearerAuth()
@UseGuards(TenantAdminGuard)
@Controller('admin/tenants/:tenantId/schemas')
export class ProfileSchemaController {
  constructor(private readonly schemaService: ProfileSchemaService) {}

  @Post()
  @ApiOperation({ summary: '새 schema 버전 발행' })
  publish(@Param('tenantId') tenantId: string, @Body() dto: CreateSchemaDto) {
    return this.schemaService.publish(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'schema 버전 목록 조회' })
  findAll(@Param('tenantId') tenantId: string) {
    return this.schemaService.findAll(tenantId);
  }

  @Get('active')
  @ApiOperation({ summary: '현재 활성 schema 조회' })
  findActive(@Param('tenantId') tenantId: string) {
    return this.schemaService.findActive(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'schema 단건 조회' })
  findOne(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.schemaService.findOne(tenantId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'schema 버전 deprecated 처리' })
  deprecate(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.schemaService.deprecate(tenantId, id);
  }
}
