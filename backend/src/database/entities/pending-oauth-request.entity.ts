import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('pending_oauth_requests')
export class PendingOAuthRequest {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'tenant_slug' })
  tenantSlug: string;

  @Column({ name: 'client_id' })
  clientId: string;

  @Column({ name: 'redirect_uri' })
  redirectUri: string;

  @Column({ type: 'text', array: true })
  scopes: string[];

  @Column({ type: 'varchar', nullable: true })
  state: string | null;

  @Column({ name: 'code_challenge', type: 'varchar', nullable: true })
  codeChallenge: string | null;

  @Column({ name: 'code_challenge_method', type: 'varchar', nullable: true })
  codeChallengeMethod: string | null;

  @Index()
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
