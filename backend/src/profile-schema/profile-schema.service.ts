import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Ajv from 'ajv';
import { AuditAction, ProfileSchemaVersion, SchemaStatus } from '../database/entities';
import { AuditService, AuditContext } from '../common/audit/audit.service';
import { CreateSchemaDto } from './dto/create-schema.dto';

const ajv = new Ajv();
ajv.addKeyword('x-order');

@Injectable()
export class ProfileSchemaService {
  constructor(
    @InjectRepository(ProfileSchemaVersion)
    private readonly schemaRepo: Repository<ProfileSchemaVersion>,
    private readonly auditService: AuditService,
  ) {}

  async publish(tenantId: string, dto: CreateSchemaDto, ctx?: AuditContext): Promise<ProfileSchemaVersion> {
    // 유효한 JSON Schema인지 컴파일로 검증
    try {
      ajv.compile(dto.schemaJsonb);
    } catch {
      throw new BadRequestException('schemaJsonb가 유효한 JSON Schema가 아닙니다');
    }

    const last = await this.schemaRepo.findOne({
      where: { tenantId },
      order: { version: 'DESC' },
    });
    const nextVersion = last ? last.version + 1 : 1;

    const schema = this.schemaRepo.create({
      tenantId,
      version: nextVersion,
      schemaJsonb: dto.schemaJsonb,
      status: SchemaStatus.PUBLISHED,
      publishedBy: ctx?.actorId ?? dto.publishedBy ?? null,
    });

    const saved = await this.schemaRepo.save(schema);
    await this.auditService.record({
      tenantId,
      action: AuditAction.SCHEMA_PUBLISHED,
      actorType: 'admin',
      targetType: 'profile_schema',
      targetId: saved.id,
      metadata: { version: saved.version },
      ...ctx,
    });
    return saved;
  }

  async findAll(tenantId: string): Promise<ProfileSchemaVersion[]> {
    return this.schemaRepo.find({
      where: { tenantId },
      order: { version: 'DESC' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<ProfileSchemaVersion> {
    const schema = await this.schemaRepo.findOne({ where: { tenantId, id } });
    if (!schema) throw new NotFoundException(`Schema ${id} not found`);
    return schema;
  }

  async findActive(tenantId: string): Promise<ProfileSchemaVersion | null> {
    return this.schemaRepo.findOne({
      where: { tenantId, status: SchemaStatus.PUBLISHED },
      order: { version: 'DESC' },
    });
  }

  async deprecate(tenantId: string, id: string): Promise<ProfileSchemaVersion> {
    const schema = await this.findOne(tenantId, id);
    schema.status = SchemaStatus.DEPRECATED;
    return this.schemaRepo.save(schema);
  }

  /** profile 데이터를 활성 schema로 검증 */
  async validate(tenantId: string, profileData: Record<string, unknown>): Promise<void> {
    const active = await this.findActive(tenantId);
    if (!active) return; // 스키마 미정의 시 통과

    const validate = ajv.compile(active.schemaJsonb);
    if (!validate(profileData)) {
      throw new BadRequestException({
        message: '프로필 데이터가 스키마 검증에 실패했습니다',
        errors: validate.errors,
      });
    }
  }
}
