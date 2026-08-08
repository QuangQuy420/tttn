import { MigrationInterface, QueryRunner } from "typeorm";

export class BrandCategoryCrud1786169739692 implements MigrationInterface {
    name = 'BrandCategoryCrud1786169739692'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ps_categories" DROP CONSTRAINT "FK_c9745462dc06f13a3f37e813842"`);
        await queryRunner.query(`ALTER TABLE "ps_categories" DROP COLUMN "parent_id"`);
        await queryRunner.query(`ALTER TABLE "ps_brands" ADD "name_key" character varying(255) GENERATED ALWAYS AS (lower(trim(name))) STORED NOT NULL`);
        await queryRunner.query(`INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`, ["product_db","public","ps_brands","GENERATED_COLUMN","name_key","lower(trim(name))"]);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_7d9f8b5ecf08118c628930ec2e" ON "ps_brands" ("name_key") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_7d9f8b5ecf08118c628930ec2e"`);
        await queryRunner.query(`DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`, ["GENERATED_COLUMN","name_key","product_db","public","ps_brands"]);
        await queryRunner.query(`ALTER TABLE "ps_brands" DROP COLUMN "name_key"`);
        await queryRunner.query(`ALTER TABLE "ps_categories" ADD "parent_id" uuid`);
        await queryRunner.query(`ALTER TABLE "ps_categories" ADD CONSTRAINT "FK_c9745462dc06f13a3f37e813842" FOREIGN KEY ("parent_id") REFERENCES "ps_categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

}
