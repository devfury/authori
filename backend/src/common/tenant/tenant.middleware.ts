import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NextFunction, Request, Response } from 'express';
import { Tenant, TenantStatus } from '../../database/entities';

/**
 * /t/:tenantSlug/* 경로에서 tenantSlug를 파싱하여
 * req.tenantContext를 채운다.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const rawSlug = req.params['tenantSlug'] ?? this.extractSlugFromPath(req.path);
    const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
    if (!slug) {
      return next();
    }

    const tenant = await this.tenantRepo.findOne({ where: { slug } });
    if (!tenant) {
      throw new NotFoundException(`Tenant '${slug}' not found`);
    }
    if (tenant.status !== TenantStatus.ACTIVE) {
      throw new NotFoundException(`Tenant '${slug}' is not active`);
    }

    req.tenantContext = { tenantId: tenant.id, tenantSlug: slug as string };
    next();
  }

  private extractSlugFromPath(path: string): string | null {
    // /t/:tenantSlug/... 패턴에서 추출
    const match = /^\/t\/([^/]+)/.exec(path);
    return match ? match[1] : null;
  }
}
