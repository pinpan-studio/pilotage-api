import { MigrationInterface, QueryRunner } from "typeorm";

export class OrdreJalonDocument1794576214760 implements MigrationInterface {
    name = 'OrdreJalonDocument1794576214760'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "jalon_document" ADD "ordre" integer NOT NULL DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "jalon_document" DROP COLUMN "ordre"`);
    }

}
