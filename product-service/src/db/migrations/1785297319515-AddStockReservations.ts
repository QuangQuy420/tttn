import { MigrationInterface, QueryRunner } from "typeorm";

export class AddStockReservations1785297319515 implements MigrationInterface {
    name = 'AddStockReservations1785297319515'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."ps_stock_reservation_status_enum" AS ENUM('RESERVED', 'RELEASED')`);
        await queryRunner.query(`CREATE TABLE "ps_stock_reservations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid NOT NULL, "variant_id" uuid NOT NULL, "quantity" integer NOT NULL, "status" "public"."ps_stock_reservation_status_enum" NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_44b68cfd8c0732db4ab577264b8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_510966baecebf74542d813e4b0" ON "ps_stock_reservations" ("order_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_510966baecebf74542d813e4b0"`);
        await queryRunner.query(`DROP TABLE "ps_stock_reservations"`);
        await queryRunner.query(`DROP TYPE "public"."ps_stock_reservation_status_enum"`);
    }

}
