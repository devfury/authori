import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { ALL_ENTITIES } from './entities';
import { resolveDatabaseConnection } from './database-url';

// 모노레포: env 파일은 저장소 루트에 중앙집중되어 있다 (cwd=apps/api 기준 ../../).
config({ path: '../../.env' });

/**
 * TypeORM CLI 마이그레이션용 DataSource
 * 실행: npx typeorm migration:generate src/database/migrations/InitialSchema -d src/database/data-source.ts
 *
 * 접속 정보와 엔티티 목록을 런타임(DatabaseModule)과 공유한다. 예전에는 양쪽이
 * 각각 정의해 한쪽만 고치면 어긋났다.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  ...resolveDatabaseConnection(),
  entities: ALL_ENTITIES,
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
});
