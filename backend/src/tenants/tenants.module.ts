import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant, TenantSettings } from '../database/entities';
import { AuditModule } from '../common/audit/audit.module';
import { AdminAuthModule } from '../admin/auth/admin-auth.module';
import { ScopesModule } from '../oauth/scopes/scopes.module';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, TenantSettings]),
    AuditModule,
    AdminAuthModule,
    ScopesModule,
  ],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
