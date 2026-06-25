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
  loginId?: string;
  profile?: Record<string, string>;
}

export type SimpleTransform =
  | 'base64'
  | 'base64url'
  | 'md5'
  | 'sha256'
  | 'uppercase'
  | 'lowercase'
  | 'trim'
  | 'email_prefix'
  | 'email_domain';

export type ParameterizedTransform =
  | { type: 'prefix'; value: string }
  | { type: 'suffix'; value: string }
  | { type: 'template'; pattern: string }
  | { type: 'regex_extract'; pattern: string; group?: number }
  | { type: 'substring'; start: number; end?: number };

export type TransformSpec = SimpleTransform | ParameterizedTransform;

export interface ExternalAuthRequestMapping {
  /** 입력 email 값을 담을 외부 요청 필드명. 기본: 'email' */
  email?: string;
  /** 입력 password 값을 담을 외부 요청 필드명. 기본: 'password' */
  password?: string;
  /** tenantId 값을 담을 외부 요청 필드명. 지정한 경우에만 포함 */
  tenantId?: string;
  /** clientId 값을 담을 외부 요청 필드명. 지정한 경우에만 포함 */
  clientId?: string;
  /** 고정 문자열 파라미터. 예: { source: 'authori' } */
  staticParams?: Record<string, string>;
  /** 각 소스 값에 적용할 변환 파이프라인. 배열 순서대로 적용됨 */
  transforms?: {
    email?: TransformSpec[];
    password?: TransformSpec[];
    tenantId?: TransformSpec[];
    clientId?: TransformSpec[];
  };
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

  @Column({ name: 'credential_headers', type: 'jsonb', nullable: true })
  credentialHeaders: Record<string, string> | null;

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

  @Column({ name: 'request_mapping', type: 'jsonb', nullable: true })
  requestMapping: ExternalAuthRequestMapping | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
