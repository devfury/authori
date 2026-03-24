import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

export enum KeyAlgorithm {
  RS256 = 'RS256',
  ES256 = 'ES256',
}

export enum KeyStatus {
  ACTIVE = 'ACTIVE',
  RETIRED = 'RETIRED',
}

@Entity('signing_keys')
export class SigningKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** null = platform 공용 키 */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @ManyToOne(() => Tenant, (t) => t.signingKeys, { nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant | null;

  @Column()
  kid: string;

  @Column({ type: 'enum', enum: KeyAlgorithm, default: KeyAlgorithm.RS256 })
  algorithm: KeyAlgorithm;

  /** PEM 형식 공개키 */
  @Column({ name: 'public_key', type: 'text' })
  publicKey: string;

  /** PEM 형식 개인키 (운영에서는 KMS/Vault로 교체 권장) */
  @Column({ name: 'private_key', type: 'text' })
  privateKey: string;

  @Column({ type: 'enum', enum: KeyStatus, default: KeyStatus.ACTIVE })
  status: KeyStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'retired_at', nullable: true, type: 'timestamptz' })
  retiredAt: Date | null;
}
