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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantAdminGuard } from '../../admin/guards/tenant-admin.guard';
import { ScopesService } from './scopes.service';
import { CreateScopeDto } from './dto/create-scope.dto';
import { UpdateScopeDto } from './dto/update-scope.dto';

@ApiTags('Admin / Scopes')
@ApiBearerAuth()
@UseGuards(TenantAdminGuard)
@Controller('admin/tenants/:tenantId/scopes')
export class ScopesController {
  constructor(private readonly scopesService: ScopesService) {}

  @Get()
  @ApiOperation({ summary: '스코프 목록 조회' })
  findAll(@Param('tenantId') tenantId: string) {
    return this.scopesService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: '스코프 단건 조회' })
  findOne(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.scopesService.findOne(tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: '커스텀 스코프 등록' })
  create(@Param('tenantId') tenantId: string, @Body() dto: CreateScopeDto) {
    return this.scopesService.create(tenantId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '스코프 수정 (displayName, description)' })
  update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateScopeDto,
  ) {
    return this.scopesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '커스텀 스코프 삭제 (기본 스코프 삭제 불가)' })
  remove(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.scopesService.remove(tenantId, id);
  }
}
