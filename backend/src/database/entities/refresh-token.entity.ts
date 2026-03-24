import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OAuthClient } from './oauth-client.entity';
import { User } from './user.entity';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'client_id' })
  clientId: string;

  @ManyToOne(() => OAuthClient, (c) => c.refreshTokens)
  @JoinColumn({ name: 'client_id', referencedColumnName: 'clientId' })
  client: OAuthClient;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index({ unique: true })
  @Column({ name: 'token_hash' })
  tokenHash: string;

  /** rotation 계보 추적 — 최초 발급 토큰의 id */
  @Column({ name: 'family_id' })
  familyId: string;

  @Column({ type: 'text', array: true })
  scopes: string[];

  @Column({ default: false })
  revoked: boolean;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
