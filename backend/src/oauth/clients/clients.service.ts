import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  AuditAction,
  ClientStatus,
  ClientType,
  OAuthClient,
  OAuthClientRedirectUri,
} from '../../database/entities';
import { CryptoUtil } from '../../common/crypto/crypto.util';
import { AuditService, AuditContext } from '../../common/audit/audit.service';
import { ScopesService } from '../scopes/scopes.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

export interface CreatedClientResult {
  client: OAuthClient;
  /** 최초 생성 시에만 반환. 이후 조회 불가 */
  plainSecret: string | null;
}

export interface ClientListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: ClientStatus;
}

export interface ClientPage {
  items: OAuthClient[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(OAuthClient)
    private readonly clientRepo: Repository<OAuthClient>,
    @InjectRepository(OAuthClientRedirectUri)
    private readonly redirectUriRepo: Repository<OAuthClientRedirectUri>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly scopesService: ScopesService,
  ) {}

  async create(
    tenantId: string,
    dto: CreateClientDto,
    ctx?: AuditContext,
  ): Promise<CreatedClientResult> {
    const clientId = randomUUID();
    const isConfidential =
      (dto.type ?? ClientType.CONFIDENTIAL) === ClientType.CONFIDENTIAL;
    const allowedScopes = dto.allowedScopes ?? ['openid'];
    await this.scopesService.assertScopesExist(tenantId, allowedScopes);

    let plainSecret: string | null = null;
    let secretHash: string | null = null;
    if (isConfidential) {
      plainSecret = CryptoUtil.generateToken(32);
      secretHash = await CryptoUtil.hash(plainSecret);
    }

    const client = this.clientRepo.create({
      tenantId,
      clientId,
      name: dto.name,
      type: dto.type ?? ClientType.CONFIDENTIAL,
      clientSecretHash: secretHash,
      allowedScopes,
      allowedGrants: dto.allowedGrants ?? [
        'authorization_code',
        'refresh_token',
      ],
    });

    const uris = dto.redirectUris.map((uri) =>
      this.redirectUriRepo.create({ clientId: client.clientId, uri }),
    );

    const savedClient = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(OAuthClient, client);
      await manager.save(OAuthClientRedirectUri, uris);
      return saved;
    });

    await this.auditService.record({
      tenantId,
      action: AuditAction.CLIENT_CREATED,
      targetType: 'oauth_client',
      targetId: savedClient.clientId,
      metadata: { name: savedClient.name, type: savedClient.type },
      ...ctx,
    });

    return { client: savedClient, plainSecret };
  }

  async findAll(
    tenantId: string,
    query: ClientListQuery = {},
  ): Promise<ClientPage> {
    const { page = 1, limit: rawLimit = 20, search, status } = query;
    const limit = Math.min(rawLimit, 100);
    const offset = (page - 1) * limit;

    const qb = this.clientRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.redirectUris', 'redirectUris')
      .where('c.tenantId = :tenantId', { tenantId })
      .orderBy('c.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (search) {
      qb.andWhere('(c.name ILIKE :search OR c.clientId ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    if (status) {
      qb.andWhere('c.status = :status', { status });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async findOne(tenantId: string, clientId: string): Promise<OAuthClient> {
    const client = await this.clientRepo.findOne({
      where: { tenantId, clientId },
      relations: ['redirectUris'],
    });
    if (!client) throw new NotFoundException(`Client '${clientId}' not found`);
    return client;
  }

  async update(
    tenantId: string,
    clientId: string,
    dto: UpdateClientDto,
  ): Promise<OAuthClient> {
    const client = await this.findOne(tenantId, clientId);

    if (dto.name) client.name = dto.name;
    if (dto.status) client.status = dto.status;
    if (dto.allowedScopes) {
      await this.scopesService.assertScopesExist(tenantId, dto.allowedScopes);
      client.allowedScopes = dto.allowedScopes;
    }
    if (dto.allowedGrants) client.allowedGrants = dto.allowedGrants;
    if (dto.branding !== undefined) client.branding = dto.branding ?? null;

    if (dto.redirectUris) {
      await this.dataSource.transaction(async (manager) => {
        await manager.delete(OAuthClientRedirectUri, {
          clientId: client.clientId,
        });
        const uris = dto.redirectUris!.map((uri) =>
          this.redirectUriRepo.create({ clientId: client.clientId, uri }),
        );
        client.redirectUris = await manager.save(OAuthClientRedirectUri, uris);
        await manager.save(OAuthClient, client);
      });
    } else {
      await this.clientRepo.save(client);
    }

    return this.findOne(tenantId, clientId);
  }

  async rotateSecret(
    tenantId: string,
    clientId: string,
    ctx?: AuditContext,
  ): Promise<{ plainSecret: string }> {
    const client = await this.findOne(tenantId, clientId);
    const plainSecret = CryptoUtil.generateToken(32);
    client.clientSecretHash = await CryptoUtil.hash(plainSecret);
    await this.clientRepo.save(client);
    await this.auditService.record({
      tenantId,
      action: AuditAction.CLIENT_SECRET_ROTATED,
      targetType: 'oauth_client',
      targetId: client.clientId,
      ...ctx,
    });
    return { plainSecret };
  }

  async deactivate(tenantId: string, clientId: string): Promise<void> {
    const client = await this.findOne(tenantId, clientId);
    client.status = ClientStatus.INACTIVE;
    await this.clientRepo.save(client);
  }
}
