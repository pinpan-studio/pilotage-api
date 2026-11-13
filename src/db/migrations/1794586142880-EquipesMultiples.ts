import { MigrationInterface, QueryRunner } from "typeorm";

export class EquipesMultiples1794586142880 implements MigrationInterface {
    name = 'EquipesMultiples1794586142880'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_eeb939e878365500638d47fc87"`);
        await queryRunner.query(`CREATE INDEX "IDX_b3b318e5b38717fab4d99f2712" ON "utilisateur" ("google_sub") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_b3b318e5b38717fab4d99f2712"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_eeb939e878365500638d47fc87" ON "utilisateur" ("google_sub") WHERE (google_sub IS NOT NULL)`);
    }

}
