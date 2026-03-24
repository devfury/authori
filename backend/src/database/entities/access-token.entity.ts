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

@Entity('access_tokens')
export class AccessToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'client_id' })
  clientId: string;

  @ManyToOne(() => OAuthClient, (c) => c.accessTokens)
  @JoinColumn({ name: 'client_id', referencedColumnName: 'clientId' })
  client: OAuthClient;

  /** client_credentials 플로우에서는 null */
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Index({ unique: true })
  @Column({ name: 'jti' })
  jti: string;

  @Column({ type: 'text', array: true })
  scopes: string[];

  @Column({ default: false })
  revoked: boolean;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
