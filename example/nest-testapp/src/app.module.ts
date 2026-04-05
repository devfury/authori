import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { TokenModule } from './token/token.module';
import { ResourceController } from './resource/resource.controller';
import { JwtStrategy } from './resource/jwt.strategy';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PassportModule,
    JwtModule.register({}),
    TokenModule,
  ],
  controllers: [ResourceController],
  providers: [JwtStrategy],
})
export class AppModule {}
