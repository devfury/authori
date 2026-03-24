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

/**
 * 인가 요청을 단기 메모리에 보관하는 임시 저장소.
 * TTL: 10분. 추후 Redis로 교체 가능.
 */
export class PendingRequestStore {
  private readonly store = new Map<string, PendingAuthRequest>();
  private readonly TTL_MS = 10 * 60 * 1000;

  save(request: Omit<PendingAuthRequest, 'expiresAt'>): string {
    const id = randomUUID();
    this.store.set(id, { ...request, expiresAt: Date.now() + this.TTL_MS });
    return id;
  }

  get(id: string): PendingAuthRequest | null {
    const req = this.store.get(id);
    if (!req) return null;
    if (Date.now() > req.expiresAt) {
      this.store.delete(id);
      return null;
    }
    return req;
  }

  delete(id: string): void {
    this.store.delete(id);
  }
}
