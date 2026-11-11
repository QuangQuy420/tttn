import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Hand-written (migration:generate handles enum value additions poorly):
 *  - adds `REFUNDED` to `payments_status_enum` for the mock refund flow. Postgres 16 allows
 *    `ADD VALUE` inside the migration transaction as long as the new value is not used in the
 *    same run — nothing below uses it.
 *  - widens `amount` from numeric(12,2) to numeric(19,2), the width of order-service's
 *    `orders.total_amount`, so every order total can be stored.
 */
export class RefundStatusAndWidenAmount1794355200000 implements MigrationInterface {
    name = 'RefundStatusAndWidenAmount1794355200000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."payments_status_enum" ADD VALUE IF NOT EXISTS 'REFUNDED'`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "amount" TYPE numeric(19,2)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Fails if a stored amount no longer fits numeric(12,2). The enum value is left in
        // place: Postgres cannot drop a single enum value.
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "amount" TYPE numeric(12,2)`);
    }

}
