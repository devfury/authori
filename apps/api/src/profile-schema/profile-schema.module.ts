import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfileSchemaVersion } from '../database/entities';
import { AuditModule } from '../common/audit/audit.module';
import { AdminAuthModule } from '../admin/auth/admin-auth.module';
import { ProfileSchemaService } from './profile-schema.service';
import { ProfileSchemaController } from './profile-schema.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ProfileSchemaVersion]), AuditModule, AdminAuthModule],
  controllers: [ProfileSchemaController],
  providers: [ProfileSchemaService],
  exports: [ProfileSchemaService],
})
export class ProfileSchemaModule {}
