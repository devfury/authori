import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from './common/config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuditModule } from './common/audit/audit.module';
import { TenantMiddleware } from './common/tenant/tenant.middleware';
import { RequestIdMiddleware } from './common/security/request-id.middleware';
import { Tenant } from './database/entities';
// Phase 2
import { TenantsModule } from './tenants/tenants.module';
import { ClientsModule } from './oauth/clients/clients.module';
import { ProfileSchemaModule } from './profile-schema/profile-schema.module';
import { UsersModule } from './users/users.module';
// Phase 3
import { KeysModule } from './oauth/keys/keys.module';
import { AuthorizeModule } from './oauth/authorize/authorize.module';
import { TokenModule } from './oauth/token/token.module';
import { RevokeModule } from './oauth/revoke/revoke.module';
import { DiscoveryModule } from './oauth/discovery/discovery.module';
// Phase 4
import { AdminAuthModule } from './admin/auth/admin-auth.module';
// Phase 5
import { ExternalAuthModule } from './external-auth/external-auth.module';
import { RbacModule } from './rbac/rbac.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuditModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    TypeOrmModule.forFeature([Tenant]),
    // Phase 2
    TenantsModule,
    ClientsModule,
    ProfileSchemaModule,
    UsersModule,
    // Phase 3
    KeysModule,
    AuthorizeModule,
    TokenModule,
    RevokeModule,
    DiscoveryModule,
    // Phase 4
    AdminAuthModule,
    // Phase 5
    ExternalAuthModule,
    RbacModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
    consumer
      .apply(TenantMiddleware)
      .forRoutes({ path: '/t/:tenantSlug/*path', method: RequestMethod.ALL });
  }
}
