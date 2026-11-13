import { MigrationInterface, QueryRunner } from "typeorm";

export class ConnexionGoogle1794581332534 implements MigrationInterface {
    name = 'ConnexionGoogle1794581332534'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "utilisateur" ADD "google_sub" character varying`);
        await queryRunner.query(`ALTER TABLE "utilisateur" ADD "photo_url" character varying`);
        await queryRunner.query(`ALTER TABLE "utilisateur" ADD "derniere_connexion" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "jeton_rafraichissement" ADD "session_id" uuid`);
        await queryRunner.query(`ALTER TABLE "jeton_rafraichissement" ADD "methode" character varying NOT NULL DEFAULT 'mot_de_passe'`);
        await queryRunner.query(`ALTER TABLE "jeton_rafraichissement" ADD "appareil" character varying NOT NULL DEFAULT ''`);
        await queryRunner.query(`ALTER TABLE "jeton_rafraichissement" ADD "ip" character varying NOT NULL DEFAULT ''`);
        await queryRunner.query(`ALTER TABLE "jeton_rafraichissement" ADD "utilise_le" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_eeb939e878365500638d47fc87" ON "utilisateur" ("google_sub") WHERE google_sub IS NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_59830269553e32b1bbc415b843" ON "jeton_rafraichissement" ("session_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_59830269553e32b1bbc415b843"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_eeb939e878365500638d47fc87"`);
        await queryRunner.query(`ALTER TABLE "jeton_rafraichissement" DROP COLUMN "utilise_le"`);
        await queryRunner.query(`ALTER TABLE "jeton_rafraichissement" DROP COLUMN "ip"`);
        await queryRunner.query(`ALTER TABLE "jeton_rafraichissement" DROP COLUMN "appareil"`);
        await queryRunner.query(`ALTER TABLE "jeton_rafraichissement" DROP COLUMN "methode"`);
        await queryRunner.query(`ALTER TABLE "jeton_rafraichissement" DROP COLUMN "session_id"`);
        await queryRunner.query(`ALTER TABLE "utilisateur" DROP COLUMN "derniere_connexion"`);
        await queryRunner.query(`ALTER TABLE "utilisateur" DROP COLUMN "photo_url"`);
        await queryRunner.query(`ALTER TABLE "utilisateur" DROP COLUMN "google_sub"`);
    }

}
