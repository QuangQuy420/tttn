import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildTypeOrmOptions } from '../config/typeorm-options';

// Loaded directly by the TypeORM CLI (`npm run typeorm` / `migration:generate` /
// `migration:run`), outside of Nest's DI container — so it loads `.env` itself.
config();

export const AppDataSource = new DataSource(buildTypeOrmOptions(process.env));
