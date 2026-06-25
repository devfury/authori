import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { AdminUser } from '../../database/entities';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminJwtGuard } from '../guards/admin-jwt.guard';
import { PlatformAdminGuard } from '../guards/platform-admin.guard';
import { TenantAdminGuard } from '../guards/tenant-admin.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminUser]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('app.adminJwtSecret'),
        signOptions: {
          expiresIn: config.get<number>('app.adminJwtExpiry') ?? 86400,
        },
      }),
    }),
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminJwtGuard, PlatformAdminGuard, TenantAdminGuard],
  exports: [AdminAuthService, AdminJwtGuard, PlatformAdminGuard, TenantAdminGuard],
})
export class AdminAuthModule {}
