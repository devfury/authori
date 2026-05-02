import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

export enum AuditAction {
  // 인증
  LOGIN_SUCCESS = 'LOGIN.SUCCESS',
  LOGIN_FAILURE = 'LOGIN.FAILURE',
  LOGOUT = 'LOGOUT',
  // OAuth
  TOKEN_ISSUED = 'TOKEN.ISSUED',
  TOKEN_REFRESHED = 'TOKEN.REFRESHED',
  TOKEN_REVOKED = 'TOKEN.REVOKED',
  CODE_ISSUED = 'CODE.ISSUED',
  CONSENT_GRANTED = 'CONSENT.GRANTED',
  CONSENT_REVOKED = 'CONSENT.REVOKED',
  // 사용자
  USER_CREATED = 'USER.CREATED',
  USER_UPDATED = 'USER.UPDATED',
  USER_ACTIVATED = 'USER.ACTIVATED',
  USER_DEACTIVATED = 'USER.DEACTIVATED',
  USER_LOCKED = 'USER.LOCKED',
  USER_UNLOCKED = 'USER.UNLOCKED',
  // 테넌트/클라이언트
  TENANT_CREATED = 'TENANT.CREATED',
  TENANT_UPDATED = 'TENANT.UPDATED',
  TENANT_DELETED = 'TENANT.DELETED',
  CLIENT_CREATED = 'CLIENT.CREATED',
  CLIENT_SECRET_ROTATED = 'CLIENT.SECRET_ROTATED',
  // 스키마
  SCHEMA_PUBLISHED = 'SCHEMA.PUBLISHED',
  // 외부 인증
  EXTERNAL_AUTH_ERROR = 'EXTERNAL_AUTH.ERROR',
}

@Entity('audit_logs')
@Index(['tenantId', 'createdAt'])
@Index(['actorId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @ManyToOne(() => Tenant, (t) => t.auditLogs, { nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant | null;

  /** 행위 주체 (관리자 ID 또는 사용자 ID) */
  @Column({ name: 'actor_id', type: 'varchar', nullable: true })
  actorId: string | null;

  @Column({ name: 'actor_type', type: 'varchar', nullable: true })
  actorType: string | null;

  @Column({ type: 'enum', enum: AuditAction })
  action: AuditAction;

  @Column({ name: 'target_type', type: 'varchar', nullable: true })
  targetType: string | null;

  @Column({ name: 'target_id', type: 'varchar', nullable: true })
  targetId: string | null;

  @Column({ default: true })
  success: boolean;

  /** 오류 메시지 또는 추가 컨텍스트 */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'ip_address', type: 'varchar', nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'varchar', nullable: true })
  userAgent: string | null;

  @Column({ name: 'request_id', type: 'varchar', nullable: true })
  requestId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
