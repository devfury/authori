import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AccessToken,
  AuditAction,
  ClientStatus,
  ClientType,
  OAuthClient,
  RefreshToken,
} from '../../database/entities';
import { CryptoUtil } from '../../common/crypto/crypto.util';
import { AuditService, AuditContext } from '../../common/audit/audit.service';
import { RevokeRequestDto } from './dto/revoke-request.dto';

@Injectable()
export class RevokeService {
  constructor(
    @InjectRepository(AccessToken)
    private readonly accessTokenRepo: Repository<AccessToken>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(OAuthClient)
    private readonly clientRepo: Repository<OAuthClient>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * RFC 7009: 토큰을 찾지 못해도 200 OK 반환 (정보 노출 방지)
   * client_id 제공 시 클라이언트 인증 수행. Confidential Client는 secret 검증 필수.
   */
  async revoke(
    tenantId: string,
    dto: RevokeRequestDto,
    basicAuth: { id?: string; secret?: string },
    ctx?: AuditContext,
  ): Promise<void> {
    const clientId = basicAuth.id ?? dto.client_id;

    if (clientId) {
      const client = await this.clientRepo.findOne({
        where: { tenantId, clientId, status: ClientStatus.ACTIVE },
      });
      if (!client) throw new UnauthorizedException('invalid_client');

      if (client.type === ClientType.CONFIDENTIAL) {
        const secret = basicAuth.secret ?? dto.client_secret;
        if (!secret || !client.clientSecretHash) {
          throw new UnauthorizedException('invalid_client');
        }
        const valid = await CryptoUtil.verify(secret, client.clientSecretHash);
        if (!valid) throw new UnauthorizedException('invalid_client');
      }
    }
    const hint = dto.token_type_hint;

    if (!hint || hint === 'refresh_token') {
      const tokenHash = CryptoUtil.sha256Hex(dto.token);
      const refreshToken = await this.refreshTokenRepo.findOne({
        where: { tenantId, tokenHash },
      });
      if (refreshToken) {
        await this.refreshTokenRepo.update(
          { tenantId, familyId: refreshToken.familyId },
          { revoked: true },
        );
        await this.auditService.record({
          tenantId,
          action: AuditAction.TOKEN_REVOKED,
          actorId: refreshToken.userId,
          actorType: 'user',
          targetId: refreshToken.familyId,
          targetType: 'refresh_token',
          metadata: { tokenType: 'refresh_token', familyId: refreshToken.familyId },
          ...ctx,
        });
        return;
      }
    }

    if (!hint || hint === 'access_token') {
      const parts = dto.token.split('.');
      if (parts.length === 3) {
        try {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8')) as { jti?: string; sub?: string };
          if (payload.jti) {
            await this.accessTokenRepo.update({ tenantId, jti: payload.jti }, { revoked: true });
            await this.auditService.record({
              tenantId,
              action: AuditAction.TOKEN_REVOKED,
              actorId: payload.sub,
              actorType: 'user',
              targetId: payload.jti,
              targetType: 'access_token',
              metadata: { tokenType: 'access_token', jti: payload.jti },
              ...ctx,
            });
          }
        } catch {
          // 무시
        }
      }
    }
  }
}
