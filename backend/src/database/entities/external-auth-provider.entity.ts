import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface ExternalAuthFieldMapping {
  email?: string;
  name?: string;
  loginId?: string;
  profile?: Record<string, string>;
}

@Entity('external_auth_providers')
@Index(['tenantId', 'clientId'])
export class ExternalAuthProvider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  /**
   * null이면 테넌트 전체 클라이언트에 적용.
   * 값이 있으면 해당 clientId 인증 시에만 적용.
   */
  @Column({ name: 'client_id', type: 'varchar', nullable: true })
  clientId: string | null;

  @Column({ default: true })
  enabled: boolean;

  @Column({ name: 'provider_url' })
  providerUrl: string;

  @Column({ name: 'credential_header', type: 'varchar', nullable: true })
  credentialHeader: string | null;

  @Column({ name: 'credential_value', type: 'varchar', nullable: true })
  credentialValue: string | null;

  /** 최초 인증 성공 시 로컬 User 자동 생성 여부 */
  @Column({ name: 'jit_provision', default: true })
  jitProvision: boolean;

  /**
   * 매 로그인마다 외부 서비스에서 프로필 동기화 여부.
   * true이면 매 로그인 시 외부 API 재호출.
   */
  @Column({ name: 'sync_on_login', default: true })
  syncOnLogin: boolean;

  @Column({ name: 'field_mapping', type: 'jsonb', nullable: true })
  fieldMapping: ExternalAuthFieldMapping | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
