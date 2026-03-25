import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { AuditAction, ClientStatus, ClientType, OAuthClient, OAuthClientRedirectUri } from '../../database/entities';
import { CryptoUtil } from '../../common/crypto/crypto.util';
import { AuditService, AuditContext } from '../../common/audit/audit.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

export interface CreatedClientResult {
  client: OAuthClient;
  /** 최초 생성 시에만 반환. 이후 조회 불가 */
  plainSecret: string | null;
}

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(OAuthClient)
    private readonly clientRepo: Repository<OAuthClient>,
    @InjectRepository(OAuthClientRedirectUri)
    private readonly redirectUriRepo: Repository<OAuthClientRedirectUri>,
    private readonly auditService: AuditService,
  ) {}

  async create(tenantId: string, dto: CreateClientDto, ctx?: AuditContext): Promise<CreatedClientResult> {
    const clientId = randomUUID();
    const isConfidential = (dto.type ?? ClientType.CONFIDENTIAL) === ClientType.CONFIDENTIAL;

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
      allowedScopes: dto.allowedScopes ?? ['openid'],
      allowedGrants: dto.allowedGrants ?? ['authorization_code', 'refresh_token'],
    });
    await this.clientRepo.save(client);

    const uris = dto.redirectUris.map((uri) =>
      this.redirectUriRepo.create({ clientId: client.clientId, uri }),
    );
    await this.redirectUriRepo.save(uris);

    await this.auditService.record({
      tenantId,
      action: AuditAction.CLIENT_CREATED,
      targetType: 'oauth_client',
      targetId: client.clientId,
      metadata: { name: client.name, type: client.type },
      ...ctx,
    });
    return { client, plainSecret };
  }

  async findAll(tenantId: string): Promise<OAuthClient[]> {
    return this.clientRepo.find({
      where: { tenantId },
      relations: ['redirectUris'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(tenantId: string, clientId: string): Promise<OAuthClient> {
    const client = await this.clientRepo.findOne({
      where: { tenantId, clientId },
      relations: ['redirectUris'],
    });
    if (!client) throw new NotFoundException(`Client '${clientId}' not found`);
    return client;
  }

  async update(tenantId: string, clientId: string, dto: UpdateClientDto): Promise<OAuthClient> {
    const client = await this.findOne(tenantId, clientId);

    if (dto.name) client.name = dto.name;
    if (dto.status) client.status = dto.status;
    if (dto.allowedScopes) client.allowedScopes = dto.allowedScopes;
    if (dto.allowedGrants) client.allowedGrants = dto.allowedGrants;

    if (dto.redirectUris) {
      await this.redirectUriRepo.delete({ clientId: client.clientId });
      const uris = dto.redirectUris.map((uri) =>
        this.redirectUriRepo.create({ clientId: client.clientId, uri }),
      );
      client.redirectUris = await this.redirectUriRepo.save(uris);
    }

    await this.clientRepo.save(client);
    return this.findOne(tenantId, clientId);
  }

  async rotateSecret(tenantId: string, clientId: string, ctx?: AuditContext): Promise<{ plainSecret: string }> {
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
