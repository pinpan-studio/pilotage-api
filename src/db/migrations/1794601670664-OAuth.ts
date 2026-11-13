import { MigrationInterface, QueryRunner } from "typeorm";

export class OAuth1794601670664 implements MigrationInterface {
    name = 'OAuth1794601670664'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "oauth_client" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nom" character varying NOT NULL, "redirect_uris" text array NOT NULL DEFAULT '{}', "cree_le" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d6e58a7e0ec3ac17a67ba7f97cd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "oauth_code" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "hache" character varying NOT NULL, "client_id" uuid NOT NULL, "utilisateur_id" uuid NOT NULL, "redirect_uri" character varying NOT NULL, "code_challenge" character varying NOT NULL, "role" character varying NOT NULL DEFAULT 'agent', "projets" uuid array NOT NULL DEFAULT '{}', "expire_le" TIMESTAMP WITH TIME ZONE NOT NULL, "utilise_le" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_11cf9e00ad2023ac2832b9efa6e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_6070ccc89497356af8a9015e0a" ON "oauth_code" ("hache") `);
        await queryRunner.query(`CREATE TABLE "oauth_rafraichissement" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "hache" character varying NOT NULL, "client_id" uuid NOT NULL, "jeton_id" uuid NOT NULL, "expire_le" TIMESTAMP WITH TIME ZONE NOT NULL, "revoque_le" TIMESTAMP WITH TIME ZONE, "cree_le" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3c16039a31c46d43dd36bc92b93" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_d9e679f001017cfacc1100612a" ON "oauth_rafraichissement" ("hache") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_d9e679f001017cfacc1100612a"`);
        await queryRunner.query(`DROP TABLE "oauth_rafraichissement"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6070ccc89497356af8a9015e0a"`);
        await queryRunner.query(`DROP TABLE "oauth_code"`);
        await queryRunner.query(`DROP TABLE "oauth_client"`);
    }

}
