import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OAuthClient } from './oauth-client.entity';

@Entity('oauth_client_redirect_uris')
export class OAuthClientRedirectUri {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id' })
  clientId: string;

  @ManyToOne(() => OAuthClient, (c) => c.redirectUris)
  @JoinColumn({ name: 'client_id', referencedColumnName: 'clientId' })
  client: OAuthClient;

  @Column({ name: 'uri' })
  uri: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
