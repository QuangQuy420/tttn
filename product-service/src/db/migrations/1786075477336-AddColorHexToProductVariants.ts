import { MigrationInterface, QueryRunner } from "typeorm";

export class AddColorHexToProductVariants1786075477336 implements MigrationInterface {
    name = 'AddColorHexToProductVariants1786075477336'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ps_product_variants" ADD "color_hex" character varying(7)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ps_product_variants" DROP COLUMN "color_hex"`);
    }

}
