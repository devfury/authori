import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessToken, RefreshToken, Tenant, User, UserProfile } from '../database/entities';
import { ProfileSchemaModule } from '../profile-schema/profile-schema.module';
import { AuditModule } from '../common/audit/audit.module';
import { AdminAuthModule } from '../admin/auth/admin-auth.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AccountDeletionSweepService } from './account-deletion-sweep.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserProfile, Tenant, AccessToken, RefreshToken]),
    ProfileSchemaModule,
    AuditModule,
    AdminAuthModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, AccountDeletionSweepService],
  exports: [UsersService],
})
export class UsersModule {}
