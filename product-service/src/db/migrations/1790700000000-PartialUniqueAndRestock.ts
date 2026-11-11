import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hand-written (not `migration:generate`): partial unique indexes and enum `ADD VALUE` are
 * generated poorly.
 *  - `(product_id, color, size)` and `slug` become unique among non-deleted rows only, so a
 *    soft-deleted variant / product can be re-created (sku stays globally unique).
 *  - `RESTOCKED` reservation status for `stock.restock.requested`. Not used in this run:
 *    PostgreSQL forbids using a value added in the same transaction.
 */
export class PartialUniqueAndRestock1790700000000 implements MigrationInterface {
  name = 'PartialUniqueAndRestock1790700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ps_product_variants" DROP CONSTRAINT "uq_ps_product_variants_product_color_size"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ps_product_variants_product_color_size_active" ON "ps_product_variants" ("product_id", "color", "size") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "ps_products" DROP CONSTRAINT "UQ_3601c0da1780251139fb017ff14"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ps_products_slug_active" ON "ps_products" ("slug") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."ps_stock_reservation_status_enum" ADD VALUE IF NOT EXISTS 'RESTOCKED'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Fails (as it should) if a soft-deleted row was re-created meanwhile. The RESTOCKED enum
    // value is left in place: PostgreSQL cannot remove an enum value safely.
    await queryRunner.query(`DROP INDEX "public"."UQ_ps_products_slug_active"`);
    await queryRunner.query(
      `ALTER TABLE "ps_products" ADD CONSTRAINT "UQ_3601c0da1780251139fb017ff14" UNIQUE ("slug")`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_ps_product_variants_product_color_size_active"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ps_product_variants" ADD CONSTRAINT "uq_ps_product_variants_product_color_size" UNIQUE ("product_id", "color", "size")`,
    );
  }
}
