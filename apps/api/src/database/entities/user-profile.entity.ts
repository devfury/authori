import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { ProfileSchemaVersion } from './profile-schema-version.entity';

@Entity('user_profiles')
@Index(['tenantId'])
export class UserProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @OneToOne(() => User, (u) => u.profile)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'schema_version_id', type: 'uuid', nullable: true })
  schemaVersionId: string | null;

  @ManyToOne(() => ProfileSchemaVersion, (s) => s.userProfiles, { nullable: true })
  @JoinColumn({ name: 'schema_version_id' })
  schemaVersion: ProfileSchemaVersion | null;

  /**
   * tenant 정의 커스텀 필드 저장소
   * schema_version의 JSON Schema 기준으로 검증 후 저장됨
   */
  @Column({ name: 'profile_jsonb', type: 'jsonb', default: '{}' })
  profileJsonb: Record<string, unknown>;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
