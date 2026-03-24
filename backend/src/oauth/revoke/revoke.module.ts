import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessToken, RefreshToken } from '../../database/entities';
import { AuditModule } from '../../common/audit/audit.module';
import { RevokeService } from './revoke.service';
import { RevokeController } from './revoke.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AccessToken, RefreshToken]), AuditModule],
  controllers: [RevokeController],
  providers: [RevokeService],
})
export class RevokeModule {}
