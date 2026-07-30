import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePayments1785380948220 implements MigrationInterface {
    name = 'CreatePayments1785380948220'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."payments_status_enum" AS ENUM('PAID', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid NOT NULL, "user_id" uuid NOT NULL, "order_code" character varying(100) NOT NULL, "amount" numeric(12,2) NOT NULL, "payment_method" character varying(50) NOT NULL, "status" "public"."payments_status_enum" NOT NULL, "transaction_code" character varying(100), "failure_reason" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_b2f7b823a21562eeca20e72b006" UNIQUE ("order_id"), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "payments"`);
        await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
    }

}
