import request from 'supertest';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { creerApp, creerOrg, creerUtilisateur } from './outils';
import { seedCatalogue, KIT_V1 } from '../src/db/seed/catalogue';
import { ImportKitService } from '../src/import/import-kit.service';
import { decrireMermaid } from '../src/generation/architecture';

/** Livrables générés à partir des données du projet ; catalogue indispensable / facultatif. */
describe('Génération des livrables', () => {
  let app: INestApplication; let db: DataSource; let http: any; let jeton: string;
  const P = '/api/v1/projets/exemple-declarations';
  beforeAll(async () => {
    ({ app, db } = await creerApp()); http = app.getHttpServer();
    const org = await creerOrg(db, 'g'); await creerUtilisateur(db, org, 'admin@g.ci', 'admin'); await seedCatalogue(db.manager, org.id);
    const admin = (await db.query(`SELECT id FROM utilisateur WHERE email = 'admin@g.ci'`))[0];
    await app.get(ImportKitService).importerDossier({ utilisateur_id: admin.id, organisation_id: org.id, nom: 'admin', role: 'admin', auteur_type: 'humain' }, join(KIT_V1, 'projets', 'exemple-declarations'));
    jeton = (await request(http).post('/api/v1/auth/connexion').send({ email: 'admin@g.ci', mot_de_passe: 'mdp' })).body.jeton_acces;
  });
  afterAll(() => app.close());
  const get = (u: string) => request(http).get(u).set('Authorization', `Bearer ${jeton}`);

  it('catalogue : documents indispensables et générables ; le seed ne réécrit pas une personnalisation', async () => {
    const docs = (await get(`${P}/documents`).expect(200)).body;
    expect(docs.find((d: any) => d.code === 'DAT')).toMatchObject({ importance: 'indispensable', generable: true });
    expect(docs.find((d: any) => d.code === 'TDR')).toMatchObject({ importance: 'indispensable', generable: false });
    expect(docs.find((d: any) => d.code === 'FORMATION')).toMatchObject({ importance: 'facultatif' });
    await request(http).patch('/api/v1/catalogue/FORMATION').set('Authorization', `Bearer ${jeton}`).send({ importance: 'indispensable', titre: 'Formation des utilisateurs' }).expect(200);
    const org = (await db.query(`SELECT organisation_id FROM utilisateur WHERE email = 'admin@g.ci'`))[0].organisation_id;
    await seedCatalogue(db.manager, org);
    const t = (await db.query(`SELECT importance, titre FROM type_document WHERE organisation_id = $1 AND code = 'FORMATION'`, [org]))[0];
    expect(t).toEqual({ importance: 'indispensable', titre: 'Formation des utilisateurs' });
  });

  it.each(['NOTE-CADRAGE', 'PLANNING', 'SFD', 'DAT', 'DOC-TECH', 'CHANGELOG', 'PLAN-RECETTE', 'CAHIER-RECETTE', 'PV-RECETTE', 'CR-REUNIONS', 'RAPPORTS', 'REG-RISQUES', 'REG-ACTIONS', 'REG-CHANGEMENTS', 'REG-PARTIES-PRENANTES', 'RACI', 'BORDEREAU-LIVRAISON'])('aperçu %s', async (code) => {
    const r = await get(`${P}/documents/${code}/apercu-generation`).expect(200);
    expect(r.body.contenu_md).toMatch(/^# /); expect(r.body.contenu_md).toContain('Portail de déclarations');
  });

  it('DAT : flowchart d’architecture issu des dépôts, puis nouvelle version et export lisible', async () => {
    const r = await request(http).post(`${P}/documents/DAT/generer`).set('Authorization', `Bearer ${jeton}`).send({}).expect(201);
    expect(r.body.contenu_md).toContain('```mermaid\nflowchart LR');
    expect(r.body.contenu_md).toMatch(/classDef api/);
    expect(r.body.statut).toBe('en_cours');
    const sfd = (await get(`${P}/documents/SFD/apercu-generation`)).body.contenu_md;
    expect(sfd).toContain('F-001'); expect(sfd).toContain('EX-01');
    const cahier = (await get(`${P}/documents/CAHIER-RECETTE/apercu-generation`)).body.contenu_md;
    expect(cahier).toMatch(/RT-\d{3}/);
    await get(`${P}/documents/TDR/apercu-generation`).expect(400);
    const AdmZip = require('adm-zip');
    const bin = (res: any, cb: any) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); };
    const docx = await get(`${P}/documents/DAT/export?format=docx`).buffer(true).parse(bin).expect(200);
    const xml = new AdmZip(docx.body).readAsText('word/document.xml');
    expect(xml).not.toContain('flowchart LR'); expect(xml).toContain('Utilisateurs →');
  });

  it('description d’un flowchart pour les exports', () => {
    const t = decrireMermaid('flowchart LR\n  U(["Utilisateurs"]):::acteur\n  W["<b>web</b><br/><small>Angular</small>"]:::web\n  U --> W\n  W -->|HTTPS| A');
    expect(t).toContain('- Utilisateurs → web — Angular'); expect(t).toContain('(HTTPS)');
  });
});
