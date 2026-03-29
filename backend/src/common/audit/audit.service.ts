import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditAction, AuditLog } from '../../database/entities';

export interface AuditContext {
  actorId?: string | null;
  actorType?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface AuditEventDto {
  tenantId?: string | null;
  actorId?: string | null;
  actorType?: string | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  success?: boolean;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface AuditLogQuery {
  page?: number;
  limit?: number;
  action?: AuditAction;
  success?: boolean;
  actorType?: string;
  from?: Date;
  to?: Date;
}

export interface AuditLogPage {
  items: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  async findByTenant(
    tenantId: string,
    query: AuditLogQuery = {},
  ): Promise<AuditLogPage> {
    const {
      page = 1,
      limit: rawLimit = 20,
      action,
      success,
      actorType,
      from,
      to,
    } = query;
    const limit = Math.min(rawLimit, 100);
    const offset = (page - 1) * limit;

    const qb = this.auditRepo
      .createQueryBuilder('log')
      .where('log.tenantId = :tenantId', { tenantId })
      .orderBy('log.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (action) {
      qb.andWhere('log.action = :action', { action });
    }

    if (success !== undefined) {
      qb.andWhere('log.success = :success', { success });
    }

    if (actorType) {
      qb.andWhere('log.actorType = :actorType', { actorType });
    }

    if (from) {
      qb.andWhere('log.createdAt >= :from', { from });
    }

    if (to) {
      const toEnd = new Date(to);
      toEnd.setHours(23, 59, 59, 999);
      qb.andWhere('log.createdAt <= :to', { to: toEnd });
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async record(event: AuditEventDto): Promise<void> {
    try {
      const log = this.auditRepo.create({
        tenantId: event.tenantId ?? null,
        actorId: event.actorId ?? null,
        actorType: event.actorType ?? null,
        action: event.action,
        targetType: event.targetType ?? null,
        targetId: event.targetId ?? null,
        success: event.success ?? true,
        metadata: event.metadata ?? null,
        ipAddress: event.ipAddress ?? null,
        userAgent: event.userAgent ?? null,
        requestId: event.requestId ?? null,
      });
      await this.auditRepo.save(log);
    } catch (err) {
      // 감사 로그 실패가 비즈니스 로직을 중단시키지 않도록 처리
      this.logger.error('Failed to record audit log', err);
    }
  }
}
