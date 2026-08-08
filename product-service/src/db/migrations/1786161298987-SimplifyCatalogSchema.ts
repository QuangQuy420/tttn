import { MigrationInterface, QueryRunner } from "typeorm";

export class SimplifyCatalogSchema1786161298987 implements MigrationInterface {
    name = 'SimplifyCatalogSchema1786161298987'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ps_products" ADD "face_shapes" "public"."ps_face_shape_enum" array NOT NULL DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "ps_product_variants" ADD "quantity" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "ps_product_variants" ADD "reserved_quantity" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "ps_product_variants" ADD CONSTRAINT "chk_ps_product_variants_quantity_non_negative" CHECK ("quantity" >= 0)`);
        await queryRunner.query(`ALTER TABLE "ps_product_variants" ADD CONSTRAINT "chk_ps_product_variants_reserved_quantity_non_negative" CHECK ("reserved_quantity" >= 0)`);
        await queryRunner.query(`ALTER TABLE "ps_product_variants" ADD CONSTRAINT "chk_ps_product_variants_reserved_quantity_within_quantity" CHECK ("reserved_quantity" <= "quantity")`);
        await queryRunner.query(`ALTER TABLE "ps_product_face_shapes" DROP CONSTRAINT "FK_95c96b06851b2a083db29f2a700"`);
        await queryRunner.query(`DROP TABLE "ps_product_face_shapes"`);
        await queryRunner.query(`ALTER TABLE "ps_inventory" DROP CONSTRAINT "FK_e56d0df8191b3903addd52cc82e"`);
        await queryRunner.query(`DROP TABLE "ps_inventory"`);
        await queryRunner.query(`ALTER TABLE "ps_ratings" DROP CONSTRAINT "FK_c1146dc0a9f631aad6f63a3a090"`);
        await queryRunner.query(`DROP TABLE "ps_ratings"`);
        await queryRunner.query(`ALTER TABLE "ps_product_tags" DROP CONSTRAINT "FK_8721c720f222527628b7dceb5cc"`);
        await queryRunner.query(`ALTER TABLE "ps_product_tags" DROP CONSTRAINT "FK_df3c6b7a65be0538e211db2f32e"`);
        await queryRunner.query(`DROP TABLE "ps_product_tags"`);
        await queryRunner.query(`DROP TABLE "ps_tags"`);
        await queryRunner.query(`DROP TABLE "ps_face_shape_styles"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "ps_face_shape_styles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "face_shape" "public"."ps_face_shape_enum" NOT NULL, "recommended_frame_shape" "public"."ps_frame_shape_enum" NOT NULL, "score" integer NOT NULL, "note" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_ps_face_shape_styles_shape_frame" UNIQUE ("face_shape", "recommended_frame_shape"), CONSTRAINT "PK_71ed9998fec0990f11f03dfc668" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ps_tags" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_89f3e01943df64a6145ff71b91c" UNIQUE ("name"), CONSTRAINT "PK_556f90b329a1c78078fa26604fe" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ps_product_tags" ("product_id" uuid NOT NULL, "tag_id" uuid NOT NULL, CONSTRAINT "PK_e7f48fab020d7cfef0875f2f100" PRIMARY KEY ("product_id", "tag_id"))`);
        await queryRunner.query(`ALTER TABLE "ps_product_tags" ADD CONSTRAINT "FK_df3c6b7a65be0538e211db2f32e" FOREIGN KEY ("product_id") REFERENCES "ps_products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ps_product_tags" ADD CONSTRAINT "FK_8721c720f222527628b7dceb5cc" FOREIGN KEY ("tag_id") REFERENCES "ps_tags"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`CREATE TABLE "ps_ratings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "user_id" uuid NOT NULL, "score" integer NOT NULL, "comment" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_ps_ratings_product_user" UNIQUE ("product_id", "user_id"), CONSTRAINT "chk_ps_ratings_score_range" CHECK ("score" >= 1 AND "score" <= 5), CONSTRAINT "PK_8ad5bb070be26d0be05fccba6b8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "ps_ratings" ADD CONSTRAINT "FK_c1146dc0a9f631aad6f63a3a090" FOREIGN KEY ("product_id") REFERENCES "ps_products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`CREATE TABLE "ps_inventory" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "variant_id" uuid NOT NULL, "warehouse_code" character varying(100) NOT NULL, "quantity" integer NOT NULL DEFAULT '0', "reserved_quantity" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_ps_inventory_variant_warehouse" UNIQUE ("variant_id", "warehouse_code"), CONSTRAINT "PK_3d88a42896bc8f8546002a96468" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "ps_inventory" ADD CONSTRAINT "FK_e56d0df8191b3903addd52cc82e" FOREIGN KEY ("variant_id") REFERENCES "ps_product_variants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`CREATE TABLE "ps_product_face_shapes" ("product_id" uuid NOT NULL, "face_shape" "public"."ps_face_shape_enum" NOT NULL, CONSTRAINT "PK_2f4c6aa02492fb89d5a8185e0b4" PRIMARY KEY ("product_id", "face_shape"))`);
        await queryRunner.query(`ALTER TABLE "ps_product_face_shapes" ADD CONSTRAINT "FK_95c96b06851b2a083db29f2a700" FOREIGN KEY ("product_id") REFERENCES "ps_products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ps_product_variants" DROP CONSTRAINT "chk_ps_product_variants_reserved_quantity_within_quantity"`);
        await queryRunner.query(`ALTER TABLE "ps_product_variants" DROP CONSTRAINT "chk_ps_product_variants_reserved_quantity_non_negative"`);
        await queryRunner.query(`ALTER TABLE "ps_product_variants" DROP CONSTRAINT "chk_ps_product_variants_quantity_non_negative"`);
        await queryRunner.query(`ALTER TABLE "ps_product_variants" DROP COLUMN "reserved_quantity"`);
        await queryRunner.query(`ALTER TABLE "ps_product_variants" DROP COLUMN "quantity"`);
        await queryRunner.query(`ALTER TABLE "ps_products" DROP COLUMN "face_shapes"`);
    }
}
