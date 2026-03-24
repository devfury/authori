import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OAuthClient } from './oauth-client.entity';
import { User } from './user.entity';

@Entity('consents')
@Index(['tenantId', 'userId', 'clientId'], { unique: true })
export class Consent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'client_id' })
  clientId: string;

  @ManyToOne(() => OAuthClient, (c) => c.consents)
  @JoinColumn({ name: 'client_id', referencedColumnName: 'clientId' })
  client: OAuthClient;

  @Column({ name: 'granted_scopes', type: 'text', array: true })
  grantedScopes: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
