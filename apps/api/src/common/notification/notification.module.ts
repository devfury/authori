import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant, TenantSettings, User } from '../../database/entities';
import { EzariaClient } from './ezaria.client';
import { PendingApprovalNotifierService } from './pending-approval-notifier.service';
import { PendingApprovalDigestService } from './pending-approval-digest.service';

/**
 * 알림 채널 모듈. MailModule과 동일하게 전역으로 등록해
 * 알림이 필요한 모듈이 별도 import 없이 주입받게 한다.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Tenant, TenantSettings, User])],
  providers: [EzariaClient, PendingApprovalNotifierService, PendingApprovalDigestService],
  exports: [EzariaClient, PendingApprovalNotifierService],
})
export class NotificationModule {}
