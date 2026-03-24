import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createPublicKey, generateKeyPairSync, randomUUID } from 'crypto';
import { KeyAlgorithm, KeyStatus, SigningKey } from '../../database/entities';

export interface ActiveKey {
  kid: string;
  privateKeyPem: string;
  publicKeyPem: string;
  algorithm: KeyAlgorithm;
}

@Injectable()
export class KeysService implements OnModuleInit {
  private readonly logger = new Logger(KeysService.name);

  constructor(
    @InjectRepository(SigningKey)
    private readonly keyRepo: Repository<SigningKey>,
  ) {}

  /** 앱 시작 시 플랫폼 공용 키가 없으면 자동 생성 */
  async onModuleInit() {
    const existing = await this.keyRepo.findOne({
      where: { tenantId: null as any, status: KeyStatus.ACTIVE },
    });
    if (!existing) {
      await this.generateKey(null);
      this.logger.log('Platform signing key generated');
    }
  }

  async generateKey(tenantId: string | null): Promise<SigningKey> {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    // 기존 키 retire
    await this.keyRepo.update(
      { tenantId: tenantId as any, status: KeyStatus.ACTIVE },
      { status: KeyStatus.RETIRED, retiredAt: new Date() },
    );

    const key = this.keyRepo.create({
      tenantId,
      kid: randomUUID(),
      algorithm: KeyAlgorithm.RS256,
      publicKey,
      privateKey,
      status: KeyStatus.ACTIVE,
    });
    return this.keyRepo.save(key);
  }

  async getActiveKey(tenantId: string | null = null): Promise<ActiveKey> {
    // 테넌트 전용 키 우선, 없으면 플랫폼 공용 키 사용
    let key = tenantId
      ? await this.keyRepo.findOne({ where: { tenantId, status: KeyStatus.ACTIVE } })
      : null;

    if (!key) {
      key = await this.keyRepo.findOne({
        where: { tenantId: null as any, status: KeyStatus.ACTIVE },
      });
    }

    if (!key) {
      key = await this.generateKey(null);
    }

    return {
      kid: key.kid,
      privateKeyPem: key.privateKey,
      publicKeyPem: key.publicKey,
      algorithm: key.algorithm,
    };
  }

  /** JWKS endpoint용 공개키 목록 */
  async getJwks(tenantId: string | null = null): Promise<{ keys: object[] }> {
    const keys = await this.keyRepo.find({
      where: { tenantId: tenantId as any, status: KeyStatus.ACTIVE },
    });

    // 플랫폼 공용 키도 포함
    const platformKeys =
      tenantId
        ? await this.keyRepo.find({ where: { tenantId: null as any, status: KeyStatus.ACTIVE } })
        : [];

    const allKeys = [...keys, ...platformKeys];

    const jwks = allKeys.map((k) => {
      const keyObject = createPublicKey(k.publicKey);
      const jwk = keyObject.export({ format: 'jwk' }) as Record<string, string>;
      return { ...jwk, kid: k.kid, use: 'sig', alg: k.algorithm };
    });

    return { keys: jwks };
  }
}
