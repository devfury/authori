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

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  async findByTenant(
    tenantId: string,
    limit = 50,
    offset = 0,
  ): Promise<AuditLog[]> {
    return this.auditRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
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
