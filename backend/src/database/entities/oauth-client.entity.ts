import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { OAuthClientRedirectUri } from './oauth-client-redirect-uri.entity';
import { AuthorizationCode } from './authorization-code.entity';
import { AccessToken } from './access-token.entity';
import { RefreshToken } from './refresh-token.entity';
import { Consent } from './consent.entity';

export interface LoginBranding {
  logoUrl?: string;
  primaryColor?: string | null;
  bgColor?: string | null;
  title?: string | null;
}

export enum ClientType {
  CONFIDENTIAL = 'CONFIDENTIAL',
  PUBLIC = 'PUBLIC',
}

export enum ClientStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('oauth_clients')
@Index(['tenantId', 'clientId'], { unique: true })
export class OAuthClient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, (t) => t.oauthClients)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'client_id', unique: true })
  clientId: string;

  /** bcrypt 해시로 저장. public client는 null */
  @Column({ name: 'client_secret_hash', type: 'varchar', nullable: true })
  clientSecretHash: string | null;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: ClientType, default: ClientType.CONFIDENTIAL })
  type: ClientType;

  @Column({ type: 'enum', enum: ClientStatus, default: ClientStatus.ACTIVE })
  status: ClientStatus;

  @Column({ name: 'allowed_scopes', type: 'text', array: true, default: ['openid'] })
  allowedScopes: string[];

  @Column({ name: 'allowed_grants', type: 'text', array: true, default: ['authorization_code'] })
  allowedGrants: string[];

  @Column({ type: 'jsonb', nullable: true })
  branding: LoginBranding | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => OAuthClientRedirectUri, (r) => r.client)
  redirectUris: OAuthClientRedirectUri[];

  @OneToMany(() => AuthorizationCode, (c) => c.client)
  authorizationCodes: AuthorizationCode[];

  @OneToMany(() => AccessToken, (t) => t.client)
  accessTokens: AccessToken[];

  @OneToMany(() => RefreshToken, (t) => t.client)
  refreshTokens: RefreshToken[];

  @OneToMany(() => Consent, (c) => c.client)
  consents: Consent[];
}
