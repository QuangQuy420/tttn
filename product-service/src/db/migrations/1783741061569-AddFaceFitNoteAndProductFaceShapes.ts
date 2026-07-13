import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFaceFitNoteAndProductFaceShapes1783741061569 implements MigrationInterface {
    name = 'AddFaceFitNoteAndProductFaceShapes1783741061569'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "ps_product_face_shapes" ("product_id" uuid NOT NULL, "face_shape" "public"."ps_face_shape_enum" NOT NULL, CONSTRAINT "PK_2f4c6aa02492fb89d5a8185e0b4" PRIMARY KEY ("product_id", "face_shape"))`);
        await queryRunner.query(`ALTER TABLE "ps_products" ADD "face_fit_note" text`);
        await queryRunner.query(`ALTER TABLE "ps_product_face_shapes" ADD CONSTRAINT "FK_95c96b06851b2a083db29f2a700" FOREIGN KEY ("product_id") REFERENCES "ps_products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ps_product_face_shapes" DROP CONSTRAINT "FK_95c96b06851b2a083db29f2a700"`);
        await queryRunner.query(`ALTER TABLE "ps_products" DROP COLUMN "face_fit_note"`);
        await queryRunner.query(`DROP TABLE "ps_product_face_shapes"`);
    }

}
