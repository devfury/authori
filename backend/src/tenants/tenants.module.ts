import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant, TenantSettings } from '../database/entities';
import { AuditModule } from '../common/audit/audit.module';
import { AdminAuthModule } from '../admin/auth/admin-auth.module';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, TenantSettings]), AuditModule, AdminAuthModule],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
