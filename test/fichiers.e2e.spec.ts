import request from 'supertest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { creerApp, creerOrg, creerUtilisateur } from './outils';
import { seedCatalogue, KIT_V1 } from '../src/db/seed/catalogue';
import { ImportKitService } from '../src/import/import-kit.service';
import { MembreProjet } from '../src/db/entities';
import { StockageVercelBlob } from '../src/stockage/stockage.service';

process.env.STOCKAGE_LOCAL_DIR = mkdtempSync(join(tmpdir(), 'stockage-'));
const BLOB = process.env.BLOB_READ_WRITE_TOKEN_TEST;
const PDF = Buffer.from('%PDF-1.4\n% scan signé de test\n%%EOF\n');

describe('Fichiers (stockage privé) et circuit de signature', () => {
  let app: INestApplication; let db: DataSource; let http: any; let chef: string; let dev: string; let agent: string;
  const P = '/api/v1/projets/exemple-declarations';

  beforeAll(async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN; // tests : adaptateur local
    ({ app, db } = await creerApp()); http = app.getHttpServer();
    const org = await creerOrg(db, 'principale');
    const admin = await creerUtilisateur(db, org, 'admin@exemple.ci', 'admin');
    const uChef = await creerUtilisateur(db, org, 'chef@exemple.ci', 'chef_projet');
    const uDev = await creerUtilisateur(db, org, 'dev@exemple.ci', 'developpeur');
    await seedCatalogue(db.manager, org.id);
    const { projet } = await app.get(ImportKitService).importerDossier({ utilisateur_id: admin.id, organisation_id: org.id, nom: 'admin', role: 'admin', auteur_type: 'humain' }, join(KIT_V1, 'projets', 'exemple-declarations'));
    await db.getRepository(MembreProjet).save([
      { organisation_id: org.id, projet_id: projet.id, utilisateur_id: uChef.id, role: 'chef_projet' },
      { organisation_id: org.id, projet_id: projet.id, utilisateur_id: uDev.id, role: 'developpeur' },
    ]);
    const cnx = async (email: string) => (await request(http).post('/api/v1/auth/connexion').send({ email, mot_de_passe: 'mdp' })).body.jeton_acces;
    chef = await cnx('chef@exemple.ci'); dev = await cnx('dev@exemple.ci');
    agent = (await request(http).post('/api/v1/jetons').set('Authorization', `Bearer ${await cnx('admin@exemple.ci')}`).send({ utilisateur_id: uDev.id, nom: 'x', projets: [projet.id] })).body.jeton;
  });
  afterAll(() => app.close());

  it('signer sans scan est refusé ; le développeur et l’agent ne peuvent pas signer', async () => {
    await request(http).patch(`${P}/documents/PAQ/statut`).set('Authorization', `Bearer ${dev}`).send({ statut: 'valide' }).expect(403);
    await request(http).patch(`${P}/documents/PAQ/statut`).set('Authorization', `Bearer ${agent}`).send({ statut: 'signe' }).expect(403);
    const r = await request(http).patch(`${P}/documents/PAQ/statut`).set('Authorization', `Bearer ${chef}`).send({ statut: 'signe' }).expect(403);
    expect(r.body.message).toMatch(/scan signé/);
  });

  it('dépôt d’un scan (chef), téléchargement contrôlé, puis signature ; l’alerte « signé sans scan » disparaît', async () => {
    await request(http).post(`${P}/fichiers`).set('Authorization', `Bearer ${agent}`).field('categorie', 'scan_signe').field('document', 'CONTRAT').attach('fichier', PDF, { filename: 'CONTRAT.pdf', contentType: 'application/pdf' }).expect(403);
    await request(http).post(`${P}/fichiers`).set('Authorization', `Bearer ${chef}`).field('categorie', 'annexe').attach('fichier', Buffer.from('x'), { filename: 'a.exe', contentType: 'application/x-msdownload' }).expect(400);
    const avant = (await request(http).get(`${P}/alertes`).set('Authorization', `Bearer ${chef}`)).body.map((x: any) => x.texte);
    expect(avant.some((t: string) => t.includes('Contrat') && t.includes('aucun scan'))).toBe(true);

    const f = await request(http).post(`${P}/fichiers`).set('Authorization', `Bearer ${chef}`).field('categorie', 'scan_signe').field('document', 'CONTRAT')
      .attach('fichier', PDF, { filename: 'CONTRAT-signé.pdf', contentType: 'application/pdf' }).expect(201);
    const c = await request(http).get(`${P}/fichiers/${f.body.id}/contenu`).set('Authorization', `Bearer ${dev}`).buffer(true).parse((res, cb) => { const b: Buffer[] = []; res.on('data', (d: Buffer) => b.push(d)); res.on('end', () => cb(null, Buffer.concat(b))); }).expect(200);
    expect(Buffer.compare(c.body, PDF)).toBe(0);
    expect(c.headers['content-disposition']).toContain('CONTRAT-sign%C3%A9.pdf');

    const apres = (await request(http).get(`${P}/alertes`).set('Authorization', `Bearer ${chef}`)).body.map((x: any) => x.texte);
    expect(apres.some((t: string) => t.includes('Contrat') && t.includes('aucun scan'))).toBe(false);

    await request(http).post(`${P}/fichiers`).set('Authorization', `Bearer ${chef}`).field('categorie', 'scan_signe').field('document', 'PAQ').attach('fichier', PDF, { filename: 'PAQ.pdf', contentType: 'application/pdf' }).expect(201);
    expect((await request(http).patch(`${P}/documents/PAQ/statut`).set('Authorization', `Bearer ${chef}`).send({ statut: 'signe' }).expect(200)).body.statut).toBe('signe');
  });

  it('suppression : refusée à l’agent et au développeur, logique pour le chef de projet', async () => {
    const l = (await request(http).get(`${P}/fichiers`).set('Authorization', `Bearer ${chef}`)).body;
    await request(http).delete(`${P}/fichiers/${l[0].id}`).set('Authorization', `Bearer ${agent}`).expect(403);
    await request(http).delete(`${P}/fichiers/${l[0].id}`).set('Authorization', `Bearer ${dev}`).expect(403);
    await request(http).delete(`${P}/fichiers/${l[0].id}`).set('Authorization', `Bearer ${chef}`).expect(204);
    expect((await request(http).get(`${P}/fichiers`).set('Authorization', `Bearer ${chef}`)).body).toHaveLength(l.length - 1);
  });

  (BLOB ? it : it.skip)('Vercel Blob réel (BLOB_READ_WRITE_TOKEN_TEST) : dépôt, lecture privée, suppression', async () => {
    const s = new StockageVercelBlob(BLOB!);
    const cle = `tests/${Date.now()}-scan.pdf`;
    await s.deposer(cle, PDF, 'application/pdf');
    const lu = await s.lire(cle);
    const morceaux: Buffer[] = []; for await (const m of lu!.flux) morceaux.push(m as Buffer);
    expect(Buffer.concat(morceaux).equals(PDF)).toBe(true);
    await s.supprimer(cle);
  });
});
