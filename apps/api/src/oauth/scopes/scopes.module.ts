import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantScope } from '../../database/entities';
import { AdminAuthModule } from '../../admin/auth/admin-auth.module';
import { ScopesService } from './scopes.service';
import { ScopesController } from './scopes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TenantScope]), AdminAuthModule],
  controllers: [ScopesController],
  providers: [ScopesService],
  exports: [ScopesService],
})
export class ScopesModule {}
