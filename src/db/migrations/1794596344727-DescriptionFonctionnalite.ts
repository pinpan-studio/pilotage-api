import { MigrationInterface, QueryRunner } from "typeorm";

export class DescriptionFonctionnalite1794596344727 implements MigrationInterface {
    name = 'DescriptionFonctionnalite1794596344727'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "fonctionnalite" ADD "description" text NOT NULL DEFAULT ''`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "fonctionnalite" DROP COLUMN "description"`);
    }

}
