import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1782982060973 implements MigrationInterface {
    name = 'InitSchema1782982060973'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "ps_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "parent_id" uuid, "name" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_3df9b83f8cce9aa37a586b9ebbb" UNIQUE ("slug"), CONSTRAINT "PK_4cdee9474b9b6dd3ada79729d2d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ps_product_variants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "color" character varying(100) NOT NULL, "size" character varying(50) NOT NULL, "extra_price" numeric(10,2) NOT NULL DEFAULT '0', "sku_variant" character varying(100) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_579994e0e5aad6e9fb8c19da3ee" UNIQUE ("sku_variant"), CONSTRAINT "uq_ps_product_variants_product_color_size" UNIQUE ("product_id", "color", "size"), CONSTRAINT "PK_a3b882e93bfa64d6d67687af7be" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ps_product_images" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "variant_id" uuid, "image_url" character varying(512) NOT NULL, "is_thumbnail" boolean NOT NULL DEFAULT false, "sort_order" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_66763d57687dd05984d1346a75f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."ps_frame_shape_enum" AS ENUM('ROUND', 'SQUARE', 'OVAL', 'CAT_EYE', 'AVIATOR', 'RECTANGLE', 'WAYFARER', 'RIMLESS')`);
        await queryRunner.query(`CREATE TYPE "public"."ps_gender_target_enum" AS ENUM('MALE', 'FEMALE', 'UNISEX')`);
        await queryRunner.query(`CREATE TYPE "public"."ps_product_status_enum" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED')`);
        await queryRunner.query(`CREATE TABLE "ps_products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "brand_id" uuid NOT NULL, "category_id" uuid NOT NULL, "sku" character varying(100) NOT NULL, "name" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, "description" text, "frame_shape" "public"."ps_frame_shape_enum" NOT NULL, "gender_target" "public"."ps_gender_target_enum" NOT NULL, "material" character varying(100), "base_price" numeric(10,2) NOT NULL, "status" "public"."ps_product_status_enum" NOT NULL DEFAULT 'DRAFT', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_ea874194490f302ed8a002db22b" UNIQUE ("sku"), CONSTRAINT "UQ_3601c0da1780251139fb017ff14" UNIQUE ("slug"), CONSTRAINT "PK_0d9719f474adf7acac3dc57a747" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_a0b5621851334fe2cd6dc6f18b" ON "ps_products" ("gender_target") `);
        await queryRunner.query(`CREATE INDEX "IDX_0e47fc26b40e5dd2e9a19e89ae" ON "ps_products" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_ae5e01ec50d35e3b837c9ea919" ON "ps_products" ("frame_shape") `);
        await queryRunner.query(`CREATE INDEX "IDX_a494bbb12825adbcd04b08d934" ON "ps_products" ("brand_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_2b18893f546ba9572b6388773d" ON "ps_products" ("category_id") `);
        await queryRunner.query(`CREATE TABLE "ps_brands" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "logo_url" character varying(512), "description" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f9b6c32b874f24261b12d02a386" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ps_inventory" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "variant_id" uuid NOT NULL, "warehouse_code" character varying(100) NOT NULL, "quantity" integer NOT NULL DEFAULT '0', "reserved_quantity" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_ps_inventory_variant_warehouse" UNIQUE ("variant_id", "warehouse_code"), CONSTRAINT "PK_3d88a42896bc8f8546002a96468" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."ps_face_shape_enum" AS ENUM('ROUND', 'SQUARE', 'OVAL', 'HEART', 'DIAMOND', 'OBLONG')`);
        await queryRunner.query(`CREATE TABLE "ps_face_shape_styles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "face_shape" "public"."ps_face_shape_enum" NOT NULL, "recommended_frame_shape" "public"."ps_frame_shape_enum" NOT NULL, "score" integer NOT NULL, "note" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_ps_face_shape_styles_shape_frame" UNIQUE ("face_shape", "recommended_frame_shape"), CONSTRAINT "PK_71ed9998fec0990f11f03dfc668" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ps_tags" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_89f3e01943df64a6145ff71b91c" UNIQUE ("name"), CONSTRAINT "PK_556f90b329a1c78078fa26604fe" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ps_product_tags" ("product_id" uuid NOT NULL, "tag_id" uuid NOT NULL, CONSTRAINT "PK_e7f48fab020d7cfef0875f2f100" PRIMARY KEY ("product_id", "tag_id"))`);
        await queryRunner.query(`CREATE TABLE "ps_ratings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "user_id" uuid NOT NULL, "score" integer NOT NULL, "comment" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_ps_ratings_product_user" UNIQUE ("product_id", "user_id"), CONSTRAINT "chk_ps_ratings_score_range" CHECK ("score" >= 1 AND "score" <= 5), CONSTRAINT "PK_8ad5bb070be26d0be05fccba6b8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "ps_categories" ADD CONSTRAINT "FK_c9745462dc06f13a3f37e813842" FOREIGN KEY ("parent_id") REFERENCES "ps_categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ps_product_variants" ADD CONSTRAINT "FK_ec1817f87b5282ee513bd917955" FOREIGN KEY ("product_id") REFERENCES "ps_products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ps_product_images" ADD CONSTRAINT "FK_888fb976195f5eb84168842b016" FOREIGN KEY ("product_id") REFERENCES "ps_products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ps_product_images" ADD CONSTRAINT "FK_e5c4c55f9bc0a48ed1e5c7e5e84" FOREIGN KEY ("variant_id") REFERENCES "ps_product_variants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ps_products" ADD CONSTRAINT "FK_a494bbb12825adbcd04b08d9347" FOREIGN KEY ("brand_id") REFERENCES "ps_brands"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ps_products" ADD CONSTRAINT "FK_2b18893f546ba9572b6388773d3" FOREIGN KEY ("category_id") REFERENCES "ps_categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ps_inventory" ADD CONSTRAINT "FK_e56d0df8191b3903addd52cc82e" FOREIGN KEY ("variant_id") REFERENCES "ps_product_variants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ps_product_tags" ADD CONSTRAINT "FK_df3c6b7a65be0538e211db2f32e" FOREIGN KEY ("product_id") REFERENCES "ps_products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ps_product_tags" ADD CONSTRAINT "FK_8721c720f222527628b7dceb5cc" FOREIGN KEY ("tag_id") REFERENCES "ps_tags"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ps_ratings" ADD CONSTRAINT "FK_c1146dc0a9f631aad6f63a3a090" FOREIGN KEY ("product_id") REFERENCES "ps_products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ps_ratings" DROP CONSTRAINT "FK_c1146dc0a9f631aad6f63a3a090"`);
        await queryRunner.query(`ALTER TABLE "ps_product_tags" DROP CONSTRAINT "FK_8721c720f222527628b7dceb5cc"`);
        await queryRunner.query(`ALTER TABLE "ps_product_tags" DROP CONSTRAINT "FK_df3c6b7a65be0538e211db2f32e"`);
        await queryRunner.query(`ALTER TABLE "ps_inventory" DROP CONSTRAINT "FK_e56d0df8191b3903addd52cc82e"`);
        await queryRunner.query(`ALTER TABLE "ps_products" DROP CONSTRAINT "FK_2b18893f546ba9572b6388773d3"`);
        await queryRunner.query(`ALTER TABLE "ps_products" DROP CONSTRAINT "FK_a494bbb12825adbcd04b08d9347"`);
        await queryRunner.query(`ALTER TABLE "ps_product_images" DROP CONSTRAINT "FK_e5c4c55f9bc0a48ed1e5c7e5e84"`);
        await queryRunner.query(`ALTER TABLE "ps_product_images" DROP CONSTRAINT "FK_888fb976195f5eb84168842b016"`);
        await queryRunner.query(`ALTER TABLE "ps_product_variants" DROP CONSTRAINT "FK_ec1817f87b5282ee513bd917955"`);
        await queryRunner.query(`ALTER TABLE "ps_categories" DROP CONSTRAINT "FK_c9745462dc06f13a3f37e813842"`);
        await queryRunner.query(`DROP TABLE "ps_ratings"`);
        await queryRunner.query(`DROP TABLE "ps_product_tags"`);
        await queryRunner.query(`DROP TABLE "ps_tags"`);
        await queryRunner.query(`DROP TABLE "ps_face_shape_styles"`);
        await queryRunner.query(`DROP TYPE "public"."ps_face_shape_enum"`);
        await queryRunner.query(`DROP TABLE "ps_inventory"`);
        await queryRunner.query(`DROP TABLE "ps_brands"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2b18893f546ba9572b6388773d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a494bbb12825adbcd04b08d934"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ae5e01ec50d35e3b837c9ea919"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0e47fc26b40e5dd2e9a19e89ae"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a0b5621851334fe2cd6dc6f18b"`);
        await queryRunner.query(`DROP TABLE "ps_products"`);
        await queryRunner.query(`DROP TYPE "public"."ps_product_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."ps_gender_target_enum"`);
        await queryRunner.query(`DROP TYPE "public"."ps_frame_shape_enum"`);
        await queryRunner.query(`DROP TABLE "ps_product_images"`);
        await queryRunner.query(`DROP TABLE "ps_product_variants"`);
        await queryRunner.query(`DROP TABLE "ps_categories"`);
    }

}
