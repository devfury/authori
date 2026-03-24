import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { UserProfile } from './user-profile.entity';

export enum SchemaStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  DEPRECATED = 'DEPRECATED',
}

@Entity('profile_schema_versions')
@Index(['tenantId', 'version'], { unique: true })
export class ProfileSchemaVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, (t) => t.profileSchemaVersions)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  version: number;

  /**
   * JSON Schema 형식으로 정의된 프로필 필드 구조
   * 예: { "type": "object", "properties": { "nickname": { "type": "string" } }, "required": ["nickname"] }
   */
  @Column({ name: 'schema_jsonb', type: 'jsonb' })
  schemaJsonb: Record<string, unknown>;

  @Column({ type: 'enum', enum: SchemaStatus, default: SchemaStatus.DRAFT })
  status: SchemaStatus;

  @Column({ name: 'published_by', type: 'varchar', nullable: true })
  publishedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => UserProfile, (p) => p.schemaVersion)
  userProfiles: UserProfile[];
}
