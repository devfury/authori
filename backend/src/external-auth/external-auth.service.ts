import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExternalAuthProvider } from '../database/entities';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';

export interface ExternalAuthResult {
  authenticated: boolean;
  /**
   * 외부 시스템의 명시적 거부 사유.
   * error 필드가 없으면 외부 시스템이 의도적으로 거부 → 로컬 폴백 없음.
   */
  reason?: string;
  /**
   * 호출 자체의 기술적 오류.
   * 값이 있으면 연동 장애 → 로컬 비밀번호 폴백 허용.
   */
  error?: 'timeout' | 'network' | 'server_error';
  user?: {
    email: string;
    name?: string;
    loginId?: string;
    profile?: Record<string, unknown>;
  };
}

@Injectable()
export class ExternalAuthService {
  private readonly logger = new Logger(ExternalAuthService.name);

  constructor(
    @InjectRepository(ExternalAuthProvider)
    private readonly providerRepo: Repository<ExternalAuthProvider>,
  ) {}

  async create(tenantId: string, dto: CreateProviderDto): Promise<ExternalAuthProvider> {
    await this.checkDuplicate(tenantId, dto.clientId ?? null);
    const provider = this.providerRepo.create({
      tenantId,
      clientId: dto.clientId ?? null,
      enabled: dto.enabled ?? true,
      providerUrl: dto.providerUrl,
      credentialHeader: dto.credentialHeader ?? null,
      credentialValue: dto.credentialValue ?? null,
      jitProvision: dto.jitProvision ?? true,
      syncOnLogin: dto.syncOnLogin ?? false,
      fieldMapping: dto.fieldMapping ?? null,
    });
    return this.providerRepo.save(provider);
  }

  async findAll(tenantId: string): Promise<ExternalAuthProvider[]> {
    return this.providerRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<ExternalAuthProvider> {
    const provider = await this.providerRepo.findOne({ where: { tenantId, id } });
    if (!provider) throw new NotFoundException(`ExternalAuthProvider ${id} not found`);
    return provider;
  }

  async update(tenantId: string, id: string, dto: UpdateProviderDto): Promise<ExternalAuthProvider> {
    const provider = await this.findOne(tenantId, id);

    // 적용 범위(clientId)가 변경되는 경우에만 중복 검사
    if (dto.clientId !== undefined) {
      const newClientId = dto.clientId ?? null;
      if (newClientId !== provider.clientId) {
        await this.checkDuplicate(tenantId, newClientId);
      }
    }

    Object.assign(provider, {
      ...(dto.clientId !== undefined && { clientId: dto.clientId ?? null }),
      ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      ...(dto.providerUrl !== undefined && { providerUrl: dto.providerUrl }),
      ...(dto.credentialHeader !== undefined && { credentialHeader: dto.credentialHeader ?? null }),
      ...(dto.credentialValue !== undefined && { credentialValue: dto.credentialValue ?? null }),
      ...(dto.jitProvision !== undefined && { jitProvision: dto.jitProvision }),
      ...(dto.syncOnLogin !== undefined && { syncOnLogin: dto.syncOnLogin }),
      ...(dto.fieldMapping !== undefined && { fieldMapping: dto.fieldMapping ?? null }),
    });
    return this.providerRepo.save(provider);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.findOne(tenantId, id);
    await this.providerRepo.softDelete({ tenantId, id });
  }

  /**
   * tenant + clientId에 맞는 활성 프로바이더를 조회한다.
   * clientId 일치 우선, 없으면 테넌트 기본(client_id IS NULL) 사용.
   */
  async findActive(tenantId: string, clientId: string): Promise<ExternalAuthProvider | null> {
    // clientId 일치하는 프로바이더 우선 조회
    const exact = await this.providerRepo.findOne({
      where: { tenantId, clientId, enabled: true },
    });
    if (exact) return exact;

    // 테넌트 기본 프로바이더 (client_id IS NULL)
    return this.providerRepo
      .createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.client_id IS NULL')
      .andWhere('p.enabled = true')
      .getOne() ?? null;
  }

  /**
   * 외부 인증 API를 호출한다.
   * - 성공(authenticated:true): user 데이터 포함 반환
   * - 명시적 거부(authenticated:false): reason 포함, error 없음 → 폴백 불가
   * - 기술적 오류(timeout/network/5xx): error 필드 포함 → 폴백 허용
   */
  async callProvider(
    provider: ExternalAuthProvider,
    email: string,
    password: string,
  ): Promise<ExternalAuthResult> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (provider.credentialHeader && provider.credentialValue) {
      headers[provider.credentialHeader] = provider.credentialValue;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(provider.providerUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.status >= 500) {
        this.logger.warn(`ExternalAuthProvider ${provider.id} returned ${response.status}`);
        return { authenticated: false, error: 'server_error' };
      }

      const data = await response.json() as ExternalAuthResult;
      return data;
    } catch (err: unknown) {
      clearTimeout(timer);
      const name = (err as Error)?.name;
      if (name === 'AbortError') {
        this.logger.warn(`ExternalAuthProvider ${provider.id} timed out`);
        return { authenticated: false, error: 'timeout' };
      }
      this.logger.warn(`ExternalAuthProvider ${provider.id} network error: ${(err as Error)?.message}`);
      return { authenticated: false, error: 'network' };
    }
  }

  /**
   * fieldMapping을 적용하여 외부 응답 데이터를 User 생성 인자로 변환.
   */
  private async checkDuplicate(tenantId: string, clientId: string | null): Promise<void> {
    let existing: ExternalAuthProvider | null;
    if (clientId === null) {
      existing = await this.providerRepo
        .createQueryBuilder('p')
        .where('p.tenant_id = :tenantId', { tenantId })
        .andWhere('p.client_id IS NULL')
        .getOne() ?? null;
    } else {
      existing = await this.providerRepo.findOne({ where: { tenantId, clientId } }) ?? null;
    }
    if (existing) {
      const scope = clientId ? `클라이언트 '${clientId}'` : '테넌트 전체';
      throw new ConflictException(`${scope}에 이미 외부 인증 프로바이더가 등록되어 있습니다.`);
    }
  }

  /**
   * fieldMapping을 적용하여 외부 응답 데이터를 User 생성 인자로 변환.
   */
  applyFieldMapping(
    externalUser: NonNullable<ExternalAuthResult['user']>,
    mapping: ExternalAuthProvider['fieldMapping'],
  ): { name?: string; loginId?: string; profile: Record<string, unknown> } {
    const get = (obj: Record<string, unknown>, path: string): unknown =>
      path.split('.').reduce((cur: unknown, key) => (cur as Record<string, unknown>)?.[key], obj);

    const src = externalUser as unknown as Record<string, unknown>;

    const name = mapping?.name
      ? (get(src, mapping.name) as string | undefined)
      : externalUser.name;

    const loginId = mapping?.loginId
      ? (get(src, mapping.loginId) as string | undefined)
      : externalUser.loginId;

    const profile: Record<string, unknown> = {};
    if (externalUser.profile) {
      if (mapping?.profile) {
        for (const [extKey, localKey] of Object.entries(mapping.profile)) {
          const val = get(externalUser.profile as unknown as Record<string, unknown>, extKey);
          if (val !== undefined) profile[localKey] = val;
        }
      } else {
        Object.assign(profile, externalUser.profile);
      }
    }

    return { name, loginId, profile };
  }
}
