import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalAuthProvider } from '../database/entities';
import { ExternalAuthService } from './external-auth.service';
import { ExternalAuthController } from './external-auth.controller';
import { AdminAuthModule } from '../admin/auth/admin-auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExternalAuthProvider]),
    AdminAuthModule,
  ],
  controllers: [ExternalAuthController],
  providers: [ExternalAuthService],
  exports: [ExternalAuthService],
})
export class ExternalAuthModule {}
