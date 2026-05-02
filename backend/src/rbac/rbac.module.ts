import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  RolePermission,
  AccessToken,
  TenantPermission,
  TenantRole,
  User,
  UserRole,
} from '../database/entities';
import { AdminAuthModule } from '../admin/auth/admin-auth.module';
import { AuditModule } from '../common/audit/audit.module';
import { KeysModule } from '../oauth/keys/keys.module';
import { UsersModule } from '../users/users.module';
import { M2mRbacController } from './m2m-rbac.controller';
import { M2mUsersController } from './m2m-users.controller';
import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantRole,
      TenantPermission,
      RolePermission,
      UserRole,
      User,
      AccessToken,
    ]),
    AdminAuthModule,
    KeysModule,
    AuditModule,
    UsersModule,
  ],
  controllers: [RbacController, M2mRbacController, M2mUsersController],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}
