import { MigrationInterface, QueryRunner } from "typeorm";

export class RoleJeton1794589982082 implements MigrationInterface {
    name = 'RoleJeton1794589982082'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "jeton_api" ADD "role" character varying NOT NULL DEFAULT 'agent'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "jeton_api" DROP COLUMN "role"`);
    }

}
