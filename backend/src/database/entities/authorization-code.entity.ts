import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { OAuthClient } from './oauth-client.entity';
import { User } from './user.entity';

export enum CodeChallengeMethod {
  S256 = 'S256',
  PLAIN = 'PLAIN',
}

@Entity('authorization_codes')
export class AuthorizationCode {
  @PrimaryColumn()
  code: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'client_id' })
  clientId: string;

  @ManyToOne(() => OAuthClient, (c) => c.authorizationCodes)
  @JoinColumn({ name: 'client_id', referencedColumnName: 'clientId' })
  client: OAuthClient;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'redirect_uri' })
  redirectUri: string;

  @Column({ type: 'text', array: true })
  scopes: string[];

  @Column({ name: 'code_challenge', type: 'varchar', nullable: true })
  codeChallenge: string | null;

  @Column({
    name: 'code_challenge_method',
    type: 'enum',
    enum: CodeChallengeMethod,
    nullable: true,
  })
  codeChallengeMethod: CodeChallengeMethod | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ default: false })
  used: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
