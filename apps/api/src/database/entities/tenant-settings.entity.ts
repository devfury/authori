import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity('tenant_settings')
export class TenantSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @OneToOne(() => Tenant, (t) => t.settings)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  /** 액세스 토큰 만료 시간 (초) */
  @Column({ name: 'access_token_ttl', default: 3600 })
  accessTokenTtl: number;

  /** 리프레시 토큰 만료 시간 (초) */
  @Column({ name: 'refresh_token_ttl', default: 2592000 })
  refreshTokenTtl: number;

  /** public client에 PKCE 강제 여부 */
  @Column({ name: 'require_pkce', default: true })
  requirePkce: boolean;

  /** 허용 grant types */
  @Column({
    name: 'allowed_grants',
    type: 'text',
    array: true,
    default: ['authorization_code', 'refresh_token'],
  })
  allowedGrants: string[];

  /** refresh token rotation 사용 여부 */
  @Column({ name: 'refresh_token_rotation', default: true })
  refreshTokenRotation: boolean;

  /** 비밀번호 최소 길이 */
  @Column({ name: 'password_min_length', default: 8 })
  passwordMinLength: number;

  /** OAuth 로그인 페이지에서 공개 회원가입 허용 여부 */
  @Column({ name: 'allow_registration', default: false })
  allowRegistration: boolean;

  /** 공개 회원가입으로 생성된 사용자를 즉시 활성화할지 여부 */
  @Column({ name: 'auto_activate_registration', default: false })
  autoActivateRegistration: boolean;

  /**
   * 공개 회원가입 시 이메일 인증을 요구할지 여부.
   * true이면 가입자는 INACTIVE로 생성되고 인증 메일의 링크를 클릭해야 활성화된다.
   * 이 설정이 켜지면 autoActivateRegistration보다 우선한다.
   */
  @Column({ name: 'email_verification_required', default: false })
  emailVerificationRequired: boolean;

  /** 인증 메일 발신자 주소. 미설정 시 하드코딩 기본값 사용 (`Name <addr>` 형식 허용) */
  @Column({ name: 'mail_from', type: 'varchar', nullable: true })
  mailFrom: string | null;

  /**
   * 개발용 강제 수신자. NODE_ENV=development에서만 적용되며,
   * 설정 시 모든 인증 메일 수신자를 이 주소로 강제 변경한다.
   * production에서는 설정할 수 없다(저장 API에서 무시).
   */
  @Column({ name: 'mail_dev_redirect_to', type: 'varchar', nullable: true })
  mailDevRedirectTo: string | null;

  /** 계정 비활성화 후 자동 삭제까지의 유예 일수 */
  @Column({ name: 'account_deletion_grace_period_days', default: 30 })
  accountDeletionGracePeriodDays: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
