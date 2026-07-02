import 'reflect-metadata';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SeedService } from './services/seed.service';

/**
 * Seed runner (T11) — loads `infra/seed/products.json` into `product_db`.
 * Boots a full Nest application context (so the seed goes through the same
 * service/repository layers as the running app — no ad hoc DB access) and resolves
 * `SeedService` from it. Run via `npm run seed` (ts-node) or `node dist/seed.js`
 * after `npm run build`.
 */
async function main() {
  const seedFilePath =
    process.env.SEED_FILE_PATH ??
    join(__dirname, '..', '..', 'infra', 'seed', 'products.json');

  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const seedService = app.get(SeedService);
    const summary = await seedService.run(seedFilePath);
    console.log('Seed summary:', summary);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exitCode = 1;
});
