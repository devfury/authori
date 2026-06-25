import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { appConfig, dbConfig } from './app.config';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, dbConfig],
      // 모노레포: env 파일은 저장소 루트에 중앙집중되어 있다 (cwd=apps/api 기준 ../../).
      envFilePath: ['../../.env.local', '../../.env'],
    }),
  ],
})
export class ConfigModule {}
