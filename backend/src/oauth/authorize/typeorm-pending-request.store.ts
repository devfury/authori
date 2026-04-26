import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { PendingOAuthRequest } from '../../database/entities';
import {
  IPendingRequestStore,
  PendingAuthRequest,
} from './pending-request.store';

@Injectable()
export class TypeOrmPendingRequestStore implements IPendingRequestStore {
  private readonly TTL_MS = 10 * 60 * 1000;

  constructor(
    @InjectRepository(PendingOAuthRequest)
    private readonly repo: Repository<PendingOAuthRequest>,
  ) {}

  async save(request: Omit<PendingAuthRequest, 'expiresAt'>): Promise<string> {
    const id = randomUUID();
    await this.repo.save({
      id,
      tenantId: request.tenantId,
      tenantSlug: request.tenantSlug,
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      scopes: request.scopes,
      state: request.state ?? null,
      codeChallenge: request.codeChallenge ?? null,
      codeChallengeMethod: request.codeChallengeMethod ?? null,
      expiresAt: new Date(Date.now() + this.TTL_MS),
    });
    return id;
  }

  async get(id: string): Promise<PendingAuthRequest | null> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) return null;
    if (row.expiresAt < new Date()) {
      await this.repo.delete(id);
      return null;
    }
    return {
      tenantId: row.tenantId,
      tenantSlug: row.tenantSlug,
      clientId: row.clientId,
      redirectUri: row.redirectUri,
      scopes: row.scopes,
      ...(row.state != null && { state: row.state }),
      ...(row.codeChallenge != null && { codeChallenge: row.codeChallenge }),
      ...(row.codeChallengeMethod != null && {
        codeChallengeMethod: row.codeChallengeMethod,
      }),
      expiresAt: row.expiresAt.getTime(),
    };
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
