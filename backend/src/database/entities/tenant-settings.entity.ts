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

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
