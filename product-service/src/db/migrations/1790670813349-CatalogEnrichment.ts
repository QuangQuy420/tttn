import { MigrationInterface, QueryRunner } from "typeorm";

export class CatalogEnrichment1790670813349 implements MigrationInterface {
    name = 'CatalogEnrichment1790670813349'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."ps_image_kind_enum" AS ENUM('GALLERY', 'TRY_ON')`);
        await queryRunner.query(`ALTER TABLE "ps_product_images" ADD "kind" "public"."ps_image_kind_enum" NOT NULL DEFAULT 'GALLERY'`);
        await queryRunner.query(`CREATE TYPE "public"."ps_material_type_enum" AS ENUM('ACETATE', 'METAL', 'TITANIUM', 'TR90', 'PLASTIC', 'MIXED')`);
        await queryRunner.query(`ALTER TABLE "ps_products" ADD "material_type" "public"."ps_material_type_enum"`);
        await queryRunner.query(`ALTER TABLE "ps_products" ADD "lens_width_mm" smallint`);
        await queryRunner.query(`ALTER TABLE "ps_products" ADD "bridge_width_mm" smallint`);
        await queryRunner.query(`ALTER TABLE "ps_products" ADD "temple_length_mm" smallint`);
        await queryRunner.query(`ALTER TABLE "ps_products" ADD "frame_width_mm" smallint`);
        await queryRunner.query(`CREATE INDEX "IDX_1748b03982410431c411ad5b8a" ON "ps_products" ("material_type") `);
        // Hand-appended backfill: map the free-text material of existing products to material_type.
        await queryRunner.query(`UPDATE "ps_products" SET "material_type" = 'ACETATE' WHERE "material" ILIKE '%acetate%'`);
        await queryRunner.query(`UPDATE "ps_products" SET "material_type" = 'METAL' WHERE "material" ILIKE '%kim loại%'`);
        await queryRunner.query(`UPDATE "ps_products" SET "material_type" = 'TITANIUM' WHERE "material" ILIKE '%titan%'`);
        // Hand-appended backfill: mark at most one existing transparent PNG per product as TRY_ON
        // (product-level image first), then enforce "one TRY_ON per product" — the unique index
        // must come after this backfill or it would fail on products with several candidates.
        await queryRunner.query(`UPDATE "ps_product_images" SET "kind" = 'TRY_ON' WHERE "id" IN (SELECT DISTINCT ON ("product_id") "id" FROM "ps_product_images" WHERE "image_url" LIKE '%removebg%' OR "image_url" LIKE '%-main.png' ORDER BY "product_id", ("variant_id" IS NULL) DESC, "sort_order" ASC, "created_at" ASC)`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_ps_product_images_try_on" ON "ps_product_images" ("product_id") WHERE "kind" = 'TRY_ON'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_1748b03982410431c411ad5b8a"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_ps_product_images_try_on"`);
        await queryRunner.query(`ALTER TABLE "ps_products" DROP COLUMN "frame_width_mm"`);
        await queryRunner.query(`ALTER TABLE "ps_products" DROP COLUMN "temple_length_mm"`);
        await queryRunner.query(`ALTER TABLE "ps_products" DROP COLUMN "bridge_width_mm"`);
        await queryRunner.query(`ALTER TABLE "ps_products" DROP COLUMN "lens_width_mm"`);
        await queryRunner.query(`ALTER TABLE "ps_products" DROP COLUMN "material_type"`);
        await queryRunner.query(`DROP TYPE "public"."ps_material_type_enum"`);
        await queryRunner.query(`ALTER TABLE "ps_product_images" DROP COLUMN "kind"`);
        await queryRunner.query(`DROP TYPE "public"."ps_image_kind_enum"`);
    }

}
