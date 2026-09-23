import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { TenantAdminGuard } from '../admin/guards/tenant-admin.guard';
import type { AdminJwtPayload } from '../admin/auth/admin-auth.service';
import { AdminRole, TenantStatus } from '../database/entities';

/**
 * 테넌트 관리자도 자기 테넌트는 조회·설정할 수 있어야 하므로 가드를 클래스가 아니라
 * 메서드마다 건다. NestJS 에서 메서드 레벨 가드는 클래스 레벨 가드를 대체하지 않고
 * 함께 실행되므로, 일부 엔드포인트만 완화하려면 클래스 레벨 가드를 두면 안 된다.
 *
 * 경로 파라미터는 `:tenantId` 로 통일한다. TenantAdminGuard 가 테넌트 경계를 이 이름으로
 * 검사하며, 다른 테넌트 범위 컨트롤러도 모두 같은 규약을 쓴다.
 */
@ApiTags('Admin / Tenants')
@ApiBearerAuth()
@Controller('admin/tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @UseGuards(PlatformAdminGuard)
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
  @UseGuards(PlatformAdminGuard)
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

  /**
   * status(테넌트 활성/비활성 생명주기)와 issuer(토큰 발급자 = 신뢰 경계)는 플랫폼 관리자
   * 고유 권한이다. 테넌트 관리자가 자기 테넌트를 강제 활성화하거나 발급자를 바꾸지 못하게 막는다.
   * PATCH 는 부분 수정이므로 실제로 전달된 키(undefined 가 아닌 키)만 위반으로 본다.
   */
  private assertUpdatableBy(admin: AdminJwtPayload | undefined, dto: UpdateTenantDto): void {
    if (admin?.role === AdminRole.PLATFORM_ADMIN) return;

    const forbidden = (['status', 'issuer'] as const).filter((key) => dto[key] !== undefined);
    if (forbidden.length > 0) {
      throw new ForbiddenException(
        `Tenant admin cannot modify: ${forbidden.join(', ')}`,
      );
    }
  }

  @Get(':tenantId')
  @UseGuards(TenantAdminGuard)
  @ApiOperation({ summary: '테넌트 단건 조회' })
  async findOne(@Param('tenantId') tenantId: string) {
    return this.withEnvFlags(await this.tenantsService.findOne(tenantId));
  }

  @Patch(':tenantId')
  @UseGuards(TenantAdminGuard)
  @ApiOperation({
    summary: '테넌트 수정',
    description:
      '테넌트 관리자는 자기 테넌트의 name·settings 만 수정할 수 있다. status·issuer 는 플랫폼 관리자 전용.',
  })
  async update(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateTenantDto,
    @Req() req: Request,
  ) {
    this.assertUpdatableBy(req.admin, dto);
    return this.withEnvFlags(await this.tenantsService.update(tenantId, dto));
  }

  @Post(':tenantId/notify-test')
  @UseGuards(TenantAdminGuard)
  @ApiOperation({
    summary: 'ezAria 알림 테스트 발송',
    description:
      '테넌트에 설정된 ezAria 채팅방으로 테스트 메시지를 보낸다. 설정 미비·발송 실패는 reason과 함께 sent=false로 반환한다.',
  })
  notifyTest(@Param('tenantId') tenantId: string, @Req() req: Request) {
    return this.tenantsService.sendNotifyTest(tenantId, {
      actorId: req.admin?.sub ?? null,
      actorType: req.admin ? 'admin' : null,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      requestId: (req.headers['x-request-id'] as string) ?? null,
    });
  }

  @Delete(':tenantId')
  @UseGuards(PlatformAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '테넌트 영구 삭제' })
  deletePermanently(@Param('tenantId') tenantId: string, @Req() req: Request) {
    return this.tenantsService.deletePermanently(tenantId, {
      actorId: req.admin?.sub ?? null,
      actorType: req.admin ? 'admin' : null,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      requestId: (req.headers['x-request-id'] as string) ?? null,
    });
  }
}
