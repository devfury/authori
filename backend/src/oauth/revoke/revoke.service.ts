import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccessToken, AuditAction, RefreshToken } from '../../database/entities';
import { CryptoUtil } from '../../common/crypto/crypto.util';
import { AuditService } from '../../common/audit/audit.service';
import { RevokeRequestDto } from './dto/revoke-request.dto';

@Injectable()
export class RevokeService {
  constructor(
    @InjectRepository(AccessToken)
    private readonly accessTokenRepo: Repository<AccessToken>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * RFC 7009: 토큰을 찾지 못해도 200 OK 반환 (정보 노출 방지)
   */
  async revoke(tenantId: string, dto: RevokeRequestDto): Promise<void> {
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
          metadata: { tokenType: 'refresh_token', familyId: refreshToken.familyId },
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
              metadata: { tokenType: 'access_token', jti: payload.jti },
            });
          }
        } catch {
          // 무시
        }
      }
    }
  }
}
