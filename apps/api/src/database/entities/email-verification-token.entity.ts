import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 회원가입 이메일 인증 토큰.
 * raw 토큰은 메일 링크로만 전달하고 DB에는 sha256 해시만 저장한다.
 */
@Entity('email_verification_tokens')
export class EmailVerificationToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Index()
  @Column({ name: 'token_hash' })
  tokenHash: string;

  /** 가입을 트리거한 OAuth 클라이언트. 인증 후 목적지 해석에 사용 */
  @Column({ name: 'client_id', type: 'varchar', nullable: true })
  clientId: string | null;

  /** 요청별 동적 복귀 목적지(allowlist 검증을 통과한 값만 저장) */
  @Column({ name: 'continue_uri', type: 'varchar', nullable: true })
  continueUri: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
