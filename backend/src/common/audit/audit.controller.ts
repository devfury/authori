import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { TenantAdminGuard } from '../../admin/guards/tenant-admin.guard';
import { AuditAction } from '../../database/entities';

@ApiTags('Admin / Audit')
@ApiBearerAuth()
@UseGuards(TenantAdminGuard)
@Controller('admin/tenants/:tenantId/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: '테넌트 감사 로그 조회' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '페이지 번호 (1-based, 기본값: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '페이지당 건수 (기본값: 20, 최대: 100)' })
  @ApiQuery({ name: 'action', required: false, enum: AuditAction, description: '액션 필터' })
  @ApiQuery({ name: 'success', required: false, type: Boolean, description: '결과 필터 (true=성공, false=실패)' })
  @ApiQuery({ name: 'actorType', required: false, type: String, description: '행위자 유형 (user|admin|system|client)' })
  @ApiQuery({ name: 'from', required: false, type: String, description: '시작 일시 (YYYY-MM-DD)' })
  @ApiQuery({ name: 'to', required: false, type: String, description: '종료 일시 (YYYY-MM-DD, 해당 일 말까지 포함)' })
  findAll(
    @Param('tenantId') tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: AuditAction,
    @Query('success') success?: string,
    @Query('actorType') actorType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const parsedLimit = Math.min(limit ? parseInt(limit, 10) : 20, 100);
    const parsedPage = page ? parseInt(page, 10) : 1;

    return this.auditService.findByTenant(tenantId, {
      page: parsedPage,
      limit: parsedLimit,
      action: action || undefined,
      success: success !== undefined ? success === 'true' : undefined,
      actorType: actorType || undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }
}
