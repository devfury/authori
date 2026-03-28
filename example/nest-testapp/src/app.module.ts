import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TokenModule } from './token/token.module';
import { ResourceController } from './resource/resource.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TokenModule,
  ],
  controllers: [ResourceController],
})
export class AppModule {}
