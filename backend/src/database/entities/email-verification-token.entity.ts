import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

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

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
