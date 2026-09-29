import { MigrationInterface, QueryRunner } from "typeorm";

export class WishlistAndReviews1790680479019 implements MigrationInterface {
    name = 'WishlistAndReviews1790680479019'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "ps_wishlist_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "product_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_ps_wishlist_items_user_product" UNIQUE ("user_id", "product_id"), CONSTRAINT "PK_613a27e7dc2328c29dd7b53ad13" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_35069aff31e9d0c03e308b70a0" ON "ps_wishlist_items" ("user_id", "created_at") `);
        await queryRunner.query(`CREATE TYPE "public"."ps_review_status_enum" AS ENUM('PUBLISHED', 'HIDDEN')`);
        await queryRunner.query(`CREATE TABLE "ps_reviews" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "user_id" uuid NOT NULL, "reviewer_name" character varying(100) NOT NULL, "rating" smallint NOT NULL, "comment" text, "is_verified_purchase" boolean NOT NULL DEFAULT false, "status" "public"."ps_review_status_enum" NOT NULL DEFAULT 'PUBLISHED', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_ps_reviews_product_user" UNIQUE ("product_id", "user_id"), CONSTRAINT "chk_ps_reviews_rating_range" CHECK ("rating" >= 1 AND "rating" <= 5), CONSTRAINT "PK_25006c0c21eb8cd293aaa70dac6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_1c59da97e01d5777e003bb4a37" ON "ps_reviews" ("product_id", "status", "created_at") `);
        await queryRunner.query(`ALTER TABLE "ps_products" ADD "avg_rating" numeric(3,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "ps_products" ADD "review_count" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "ps_wishlist_items" ADD CONSTRAINT "FK_f9928cd4c7f2a14f08b3b6998f4" FOREIGN KEY ("product_id") REFERENCES "ps_products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ps_reviews" ADD CONSTRAINT "FK_e3b078a5925a6a31fdd3dfa62ff" FOREIGN KEY ("product_id") REFERENCES "ps_products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ps_reviews" DROP CONSTRAINT "FK_e3b078a5925a6a31fdd3dfa62ff"`);
        await queryRunner.query(`ALTER TABLE "ps_wishlist_items" DROP CONSTRAINT "FK_f9928cd4c7f2a14f08b3b6998f4"`);
        await queryRunner.query(`ALTER TABLE "ps_products" DROP COLUMN "review_count"`);
        await queryRunner.query(`ALTER TABLE "ps_products" DROP COLUMN "avg_rating"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1c59da97e01d5777e003bb4a37"`);
        await queryRunner.query(`DROP TABLE "ps_reviews"`);
        await queryRunner.query(`DROP TYPE "public"."ps_review_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_35069aff31e9d0c03e308b70a0"`);
        await queryRunner.query(`DROP TABLE "ps_wishlist_items"`);
    }

}
