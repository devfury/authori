import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  RolePermission,
  TenantPermission,
  TenantRole,
  User,
  UserRole,
} from '../database/entities';
import { AdminAuthModule } from '../admin/auth/admin-auth.module';
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
    ]),
    AdminAuthModule,
  ],
  controllers: [RbacController],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}
