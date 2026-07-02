import { DataSourceOptions } from 'typeorm';
import { entities } from '../db/entities';

/**
 * Single source of truth for TypeORM connection options.
 * Shared by:
 *  - `AppModule` (via `TypeOrmModule.forRootAsync`, at runtime)
 *  - `src/db/data-source.ts` (the TypeORM CLI, for `migration:generate`/`migration:run`)
 * so the two never drift apart.
 */
export function buildTypeOrmOptions(
  env: NodeJS.ProcessEnv = process.env,
): DataSourceOptions {
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set — check your .env file.');
  }

  return {
    type: 'postgres',
    url,
    entities,
    migrations: [__dirname + '/../db/migrations/*{.ts,.js}'],
    synchronize: false,
    migrationsRun: false,
  };
}
