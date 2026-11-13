import { MigrationInterface, QueryRunner } from "typeorm";

export class ImportanceDocument1794608924290 implements MigrationInterface {
    name = 'ImportanceDocument1794608924290'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "type_document" ADD "importance" character varying NOT NULL DEFAULT 'facultatif'`);
        await queryRunner.query(`UPDATE "type_document" SET "importance" = 'indispensable' WHERE "code" IN ('TDR', 'NOTE-CADRAGE', 'PLANNING', 'SFD', 'DAT', 'MCD', 'DOC-TECH', 'CHANGELOG', 'PLAN-RECETTE', 'CAHIER-RECETTE', 'PV-RECETTE', 'PLAN-DEPLOIEMENT', 'GUIDE-INSTALLATION', 'MANUEL-UTILISATEUR', 'PV-RECEPTION-PROVISOIRE', 'CR-REUNIONS', 'REG-RISQUES')`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "type_document" DROP COLUMN "importance"`);
    }

}
