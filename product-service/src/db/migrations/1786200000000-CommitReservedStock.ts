import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommitReservedStock1786200000000 implements MigrationInterface {
  name = 'CommitReservedStock1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const orphanRows: Array<{ count: string }> = await queryRunner.query(`
      SELECT COUNT(*)::text AS "count"
      FROM "ps_stock_reservations" reservation
      LEFT JOIN "ps_product_variants" variant
        ON variant."id" = reservation."variant_id"
      WHERE variant."id" IS NULL
    `);
    const orphanCount = Number(orphanRows[0]?.count ?? 0);
    if (orphanCount > 0) {
      throw new Error(
        `Cannot add stock reservation variant FK: ${orphanCount} orphan reservation(s) found`,
      );
    }

    await queryRunner.query(
      `ALTER TYPE "public"."ps_stock_reservation_status_enum" ADD VALUE IF NOT EXISTS 'COMMITTED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "ps_stock_reservations" ADD CONSTRAINT "fk_ps_stock_reservations_variant_id" FOREIGN KEY ("variant_id") REFERENCES "ps_product_variants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(): Promise<void> {
    throw new Error(
      'CommitReservedStock migration cannot be reverted because PostgreSQL cannot remove enum value COMMITTED safely.',
    );
  }
}
