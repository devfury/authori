import { randomUUID } from 'crypto';

export interface PendingAuthRequest {
  tenantId: string;
  tenantSlug: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  expiresAt: number;
}

export interface IPendingRequestStore {
  save(request: Omit<PendingAuthRequest, 'expiresAt'>): Promise<string>;
  get(id: string): Promise<PendingAuthRequest | null>;
  delete(id: string): Promise<void>;
}

export const PENDING_REQUEST_STORE = Symbol('PENDING_REQUEST_STORE');

/** 로컬 개발 전용 인메모리 구현체 */
export class InMemoryPendingRequestStore implements IPendingRequestStore {
  private readonly store = new Map<string, PendingAuthRequest>();
  private readonly TTL_MS = 10 * 60 * 1000;

  async save(request: Omit<PendingAuthRequest, 'expiresAt'>): Promise<string> {
    const id = randomUUID();
    this.store.set(id, { ...request, expiresAt: Date.now() + this.TTL_MS });
    return id;
  }

  async get(id: string): Promise<PendingAuthRequest | null> {
    const req = this.store.get(id);
    if (!req) return null;
    if (Date.now() > req.expiresAt) {
      this.store.delete(id);
      return null;
    }
    return req;
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
