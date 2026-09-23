import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { AdminUser } from './admin-user.entity';
import { Tenant } from './tenant.entity';

/**
 * 관리자 ↔ 테넌트 N:M 배정.
 *
 * 관리자가 접근할 수 있는 테넌트의 단일 진실이다. admin_users.tenant_id 단일 컬럼을
 * 대체하며, TenantAdminGuard 가 매 요청 이 표를 조회해 인가를 판정한다. JWT 에는
 * 담지 않으므로 배정 해제가 기존 토큰에도 즉시 반영된다.
 *
 * PLATFORM_ADMIN 은 이 표에 행을 두지 않는다. 전체 접근이 역할에 내재한다.
 */
@Entity('admin_user_tenants')
export class AdminUserTenant {
  @PrimaryColumn({ name: 'admin_user_id', type: 'uuid' })
  adminUserId: string;

  // 복합 PK 의 선두가 admin_user_id 라 "이 테넌트를 맡은 관리자" 역방향 조회는 타지 못한다.
  @Index()
  @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => AdminUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'admin_user_id' })
  adminUser: AdminUser;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  /** 배정 시점. 관리자 계정 변경에 감사 로그가 없는 현 상태의 최소 단서다. */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
