import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PendingOAuthRequest } from '../../database/entities';

@Injectable()
export class PendingRequestCleanupService {
  private readonly logger = new Logger(PendingRequestCleanupService.name);

  constructor(
    @InjectRepository(PendingOAuthRequest)
    private readonly repo: Repository<PendingOAuthRequest>,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanup(): Promise<void> {
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .where('expires_at < :now', { now: new Date() })
      .execute();
    this.logger.debug(`Cleaned up ${result.affected ?? 0} expired pending requests`);
  }
}
