import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantSettings } from './tenant-settings.entity';
import { User } from './user.entity';
import { OAuthClient } from './oauth-client.entity';
import { ProfileSchemaVersion } from './profile-schema-version.entity';
import { AuditLog } from './audit-log.entity';
import { SigningKey } from './signing-key.entity';
import { TenantScope } from './tenant-scope.entity';
import { TenantRole } from './tenant-role.entity';
import { TenantPermission } from './tenant-permission.entity';

export enum TenantStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  issuer: string | null;

  @Column({ type: 'enum', enum: TenantStatus, default: TenantStatus.ACTIVE })
  status: TenantStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToOne(() => TenantSettings, (s) => s.tenant, { cascade: true })
  settings: TenantSettings;

  @OneToMany(() => User, (u) => u.tenant)
  users: User[];

  @OneToMany(() => OAuthClient, (c) => c.tenant)
  oauthClients: OAuthClient[];

  @OneToMany(() => ProfileSchemaVersion, (s) => s.tenant)
  profileSchemaVersions: ProfileSchemaVersion[];

  @OneToMany(() => AuditLog, (a) => a.tenant)
  auditLogs: AuditLog[];

  @OneToMany(() => SigningKey, (k) => k.tenant)
  signingKeys: SigningKey[];

  @OneToMany(() => TenantScope, (s) => s.tenant)
  scopes: TenantScope[];

  @OneToMany(() => TenantRole, (r) => r.tenant)
  roles: TenantRole[];

  @OneToMany(() => TenantPermission, (p) => p.tenant)
  permissions: TenantPermission[];
}
