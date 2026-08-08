import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { join } from 'path';
import { buildTypeOrmOptions } from '../src/config/typeorm-options';
import {
  entities,
  Brand,
  Category,
  Product,
  ProductVariant,
  ProductImage,
} from '../src/db/entities';
import { FrameShape } from '../src/db/enums/frame-shape.enum';
import { GenderTarget } from '../src/db/enums/gender-target.enum';
import { ProductStatus } from '../src/db/enums/product-status.enum';

config();

/**
 * Jest `globalSetup` for the e2e suite (`npm run test:e2e`). Requires a real, reachable
 * Postgres via `DATABASE_URL` (same variable the app itself uses) — there is no mock
 * DB layer for these tests, per coder.md's "supertest for controller/e2e-level HTTP
 * tests" guidance.
 *
 * Runs migrations against that DB, wipes the `ps_*` tables, and inserts a small,
 * deterministic fixture (2 published products + 1 draft product) so `app.e2e-spec.ts`
 * can assert on known values without depending on `infra/seed/products.json` (owned by
 * a different task, and — see the Dev Agent Record — currently has one product whose
 * data can't satisfy the `(product_id, color, size)` unique constraint).
 */
export default async function globalSetup(): Promise<void> {
  const dataSource = new DataSource({
    ...buildTypeOrmOptions(process.env),
    migrations: [
      join(__dirname, '..', 'src', 'db', 'migrations', '*{.ts,.js}'),
    ],
  });

  await dataSource.initialize();
  await dataSource.runMigrations();

  const tableNames = entities
    .map((entity) => dataSource.getMetadata(entity).tableName)
    .join(', ');
  await dataSource.query(`TRUNCATE ${tableNames} RESTART IDENTITY CASCADE`);

  const brandRepo = dataSource.getRepository(Brand);
  const categoryRepo = dataSource.getRepository(Category);
  const productRepo = dataSource.getRepository(Product);
  const variantRepo = dataSource.getRepository(ProductVariant);
  const imageRepo = dataSource.getRepository(ProductImage);

  const brand = await brandRepo.save(
    brandRepo.create({
      name: 'E2E Test Brand',
      logoUrl: null,
      description: 'Fixture brand for product-service e2e tests',
    }),
  );
  const category = await categoryRepo.save(
    categoryRepo.create({
      name: 'E2E Test Category',
      slug: 'e2e-test-category',
    }),
  );

  const aviator = await productRepo.save(
    productRepo.create({
      brandId: brand.id,
      categoryId: category.id,
      sku: 'E2E-AVI-001',
      name: 'E2E Test Aviator',
      slug: 'e2e-test-aviator',
      description: 'Fixture product #1',
      frameShape: FrameShape.AVIATOR,
      genderTarget: GenderTarget.UNISEX,
      material: 'Metal',
      basePrice: 120.5,
      status: ProductStatus.PUBLISHED,
    }),
  );
  await variantRepo.save([
    variantRepo.create({
      productId: aviator.id,
      color: 'Black',
      size: 'M',
      extraPrice: 0,
      skuVariant: 'E2E-AVI-001-BLK-M',
    }),
    variantRepo.create({
      productId: aviator.id,
      color: 'Gold',
      size: 'L',
      extraPrice: 10,
      skuVariant: 'E2E-AVI-001-GLD-L',
    }),
  ]);
  await imageRepo.save([
    imageRepo.create({
      productId: aviator.id,
      variantId: null,
      imageUrl: 'https://example.test/e2e-aviator/main.jpg',
      isThumbnail: true,
      sortOrder: 0,
    }),
    imageRepo.create({
      productId: aviator.id,
      variantId: null,
      imageUrl: 'https://example.test/e2e-aviator/side.jpg',
      isThumbnail: false,
      sortOrder: 1,
    }),
  ]);

  const round = await productRepo.save(
    productRepo.create({
      brandId: brand.id,
      categoryId: category.id,
      sku: 'E2E-RND-002',
      name: 'E2E Test Round',
      slug: 'e2e-test-round',
      description: 'Fixture product #2',
      frameShape: FrameShape.ROUND,
      genderTarget: GenderTarget.FEMALE,
      material: 'Acetate',
      basePrice: 60,
      status: ProductStatus.PUBLISHED,
    }),
  );
  await variantRepo.save(
    variantRepo.create({
      productId: round.id,
      color: 'Silver',
      size: 'S',
      extraPrice: 0,
      skuVariant: 'E2E-RND-002-SLV-S',
    }),
  );
  await imageRepo.save(
    imageRepo.create({
      productId: round.id,
      variantId: null,
      imageUrl: 'https://example.test/e2e-round/main.jpg',
      isThumbnail: true,
      sortOrder: 0,
    }),
  );

  // A DRAFT product — proves the default `GET /products` filter (PUBLISHED-only)
  // excludes it, and that `?status=DRAFT` can still surface it explicitly.
  const draft = await productRepo.save(
    productRepo.create({
      brandId: brand.id,
      categoryId: category.id,
      sku: 'E2E-SQR-003',
      name: 'E2E Test Draft Square',
      slug: 'e2e-test-draft-square',
      description: 'Fixture product #3 (draft, unpublished)',
      frameShape: FrameShape.SQUARE,
      genderTarget: GenderTarget.MALE,
      material: 'Plastic',
      basePrice: 45,
      status: ProductStatus.DRAFT,
    }),
  );
  await variantRepo.save(
    variantRepo.create({
      productId: draft.id,
      color: 'Black',
      size: 'M',
      extraPrice: 0,
      skuVariant: 'E2E-SQR-003-BLK-M',
    }),
  );

  await dataSource.destroy();
}
