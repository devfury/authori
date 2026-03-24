import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, UserProfile } from '../database/entities';
import { ProfileSchemaModule } from '../profile-schema/profile-schema.module';
import { AuditModule } from '../common/audit/audit.module';
import { AdminAuthModule } from '../admin/auth/admin-auth.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserProfile]), ProfileSchemaModule, AuditModule, AdminAuthModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
