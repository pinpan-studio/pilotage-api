import { MigrationInterface, QueryRunner } from "typeorm";

export class Ordre1794572063435 implements MigrationInterface {
    name = 'Ordre1794572063435'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "depot" ADD "ordre" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "exigence" ADD "ordre" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "fonctionnalite" ADD "ordre" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "cas_test" ADD "ordre" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "document" ADD "ordre" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "evenement_journal" ADD "seq" BIGSERIAL NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "evenement_journal" DROP COLUMN "seq"`);
        await queryRunner.query(`ALTER TABLE "document" DROP COLUMN "ordre"`);
        await queryRunner.query(`ALTER TABLE "cas_test" DROP COLUMN "ordre"`);
        await queryRunner.query(`ALTER TABLE "fonctionnalite" DROP COLUMN "ordre"`);
        await queryRunner.query(`ALTER TABLE "exigence" DROP COLUMN "ordre"`);
        await queryRunner.query(`ALTER TABLE "depot" DROP COLUMN "ordre"`);
    }

}
