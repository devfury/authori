import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { UserProfile } from './user-profile.entity';
import { UserRole } from './user-role.entity';

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  LOCKED = 'LOCKED',
}

@Entity('users')
@Index(['tenantId', 'email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, (t) => t.users)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  /** 인증 식별자 (이메일과 별개로 login ID를 사용하는 경우 대비) */
  @Column({ name: 'login_id', type: 'varchar', nullable: true })
  loginId: string | null;

  @Column()
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Column({ name: 'failed_login_attempts', default: 0 })
  failedLoginAttempts: number;

  @Column({ name: 'locked_until', nullable: true, type: 'timestamptz' })
  lockedUntil: Date | null;

  @Column({ name: 'last_login_at', nullable: true, type: 'timestamptz' })
  lastLoginAt: Date | null;

  /** 비활성화(탈퇴) 시각. 유예기간 경과 시 자동 삭제 기준이자 미인증 INACTIVE와의 구분자 */
  @Column({ name: 'deactivated_at', nullable: true, type: 'timestamptz' })
  deactivatedAt: Date | null;

  /**
   * 관리자 승인 대기 시작 시각. 공개 회원가입 결과가 '관리자 승인 대기 INACTIVE'인 경우에만
   * 기록되고 활성화 시 null로 지워진다(보류 시에는 신청 이력으로 보존).
   * status=INACTIVE의 네 의미(관리자 승인 대기 / 보류 / 이메일 인증 대기 / 탈퇴)는
   * deactivatedAt → approvalHeldAt → pendingApprovalSince 순으로 판정한다.
   */
  @Column({ name: 'pending_approval_since', nullable: true, type: 'timestamptz' })
  pendingApprovalSince: Date | null;

  /**
   * 가입 승인 보류(거절) 시각. 보류된 사용자는 INACTIVE를 유지하되 승인 대기 집계·알림에서
   * 제외된다. 활성화 시 null로 지워지며, 별도 '보류 해제' 액션은 없다.
   */
  @Column({ name: 'approval_held_at', nullable: true, type: 'timestamptz' })
  approvalHeldAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToOne(() => UserProfile, (p) => p.user, { cascade: true })
  profile: UserProfile;

  @OneToMany(() => UserRole, (userRole) => userRole.user)
  userRoles: UserRole[];
}
