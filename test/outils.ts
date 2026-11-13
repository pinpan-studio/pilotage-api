import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { MembreProjet, Organisation, Projet, Utilisateur } from '../src/db/entities';

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST ?? 'postgres://postgres:postgres@localhost:5432/pilotage_test';
process.env.JWT_SECRET = 'secret-de-test';
process.env.MIGRATIONS_AU_DEMARRAGE = '1';

export async function creerApp(remplacements: { provide: any; useValue: any }[] = []): Promise<{ app: INestApplication; db: DataSource }> {
  let b = Test.createTestingModule({ imports: [AppModule] });
  for (const r of remplacements) b = b.overrideProvider(r.provide).useValue(r.useValue);
  const mod = await b.compile();
  const app = mod.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1', { exclude: ['mcp'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  const db = app.get(DataSource);
  const tables: { tablename: string }[] = await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'migrations'`);
  await db.query(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(',')} CASCADE`);
  return { app, db };
}

export async function creerOrg(db: DataSource, code: string) {
  return db.getRepository(Organisation).save({ code, nom: code });
}
export async function creerUtilisateur(db: DataSource, org: Organisation, email: string, role: Utilisateur['role'], mdp = 'mdp') {
  return db.getRepository(Utilisateur).save({ organisation_id: org.id, email, nom: email.split('@')[0], role, mot_de_passe_hache: await argon2.hash(mdp) });
}
export async function creerProjet(db: DataSource, org: Organisation, code: string, membres: [Utilisateur, MembreProjet['role']][] = []) {
  const p = await db.getRepository(Projet).save({ organisation_id: org.id, code, nom: code });
  for (const [u, role] of membres) await db.getRepository(MembreProjet).save({ organisation_id: org.id, projet_id: p.id, utilisateur_id: u.id, role });
  return p;
}
