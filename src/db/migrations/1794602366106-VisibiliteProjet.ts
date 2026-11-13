import { MigrationInterface, QueryRunner } from "typeorm";

export class VisibiliteProjet1794602366106 implements MigrationInterface {
    name = 'VisibiliteProjet1794602366106'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "projet" ADD "visibilite" character varying NOT NULL DEFAULT 'equipe'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "projet" DROP COLUMN "visibilite"`);
    }

}
