import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ALL_ENTITIES } from './entities';
import type { DatabaseConnection } from './database-url';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('db.host'),
        port: config.get<number>('db.port'),
        username: config.get<string>('db.username'),
        password: config.get<string>('db.password'),
        database: config.get<string>('db.database'),
        ssl: config.get<DatabaseConnection['ssl']>('db.ssl'),
        // 목록을 여기 따로 두지 않는다. data-source.ts 와 갈라져 엔티티가 누락된 전례가 있다.
        entities: ALL_ENTITIES,
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        synchronize: false,
        logging: config.get<boolean>('db.logging') ?? false,
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
