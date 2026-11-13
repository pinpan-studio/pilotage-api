import request from 'supertest';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { creerApp, creerOrg, creerUtilisateur } from './outils';
import { seedCatalogue, KIT_V1 } from '../src/db/seed/catalogue';

describe('API REST en lecture', () => {
  let app: INestApplication; let db: DataSource; let http: any; let admin: string; let dev: string;
  const get = (url: string, jeton = admin) => request(http).get(`/api/v1${url}`).set('Authorization', `Bearer ${jeton}`);

  beforeAll(async () => {
    ({ app, db } = await creerApp()); http = app.getHttpServer();
    const org = await creerOrg(db, 'principale');
    await creerUtilisateur(db, org, 'admin@exemple.ci', 'admin');
    await creerUtilisateur(db, org, 'dev@exemple.ci', 'developpeur');
    await seedCatalogue(db.manager, org.id);
    const cnx = async (email: string) => (await request(http).post('/api/v1/auth/connexion').send({ email, mot_de_passe: 'mdp' })).body.jeton_acces;
    admin = await cnx('admin@exemple.ci'); dev = await cnx('dev@exemple.ci');
  });
  afterAll(() => app.close());

  it('import par archive .zip (admin uniquement), refus d’un doublon', async () => {
    const zip = new AdmZip(); zip.addLocalFolder(join(KIT_V1, 'projets', 'exemple-declarations'), 'exemple-declarations');
    const buf = zip.toBuffer();
    await request(http).post('/api/v1/import/kit-v1').set('Authorization', `Bearer ${dev}`).attach('archive', buf, 'p.zip').expect(403);
    const r = await request(http).post('/api/v1/import/kit-v1').set('Authorization', `Bearer ${admin}`).attach('archive', buf, 'p.zip').expect(201);
    expect(r.body.bilan.fonctionnalites).toBe(9);
    await request(http).post('/api/v1/import/kit-v1').set('Authorization', `Bearer ${admin}`).attach('archive', buf, 'p.zip').expect(409);
  });

  it('portefeuille et indicateurs', async () => {
    const p = (await get('/projets').expect(200)).body;
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ code: 'exemple-declarations', nb_retours_ouverts: 2 });
    const m = (await get('/projets/exemple-declarations/indicateurs?date=2026-11-13').expect(200)).body;
    expect(Math.round(m.avancement * 100)).toBe(43);
    expect(m.alertes).toHaveLength(9);
    expect(m.synchronisation.map((s: any) => s.depot)).toEqual(['backend', 'web', 'mobile']);
  });

  it('fonctionnalités, fiche détaillée et filtres', async () => {
    const f = (await get('/projets/exemple-declarations/fonctionnalites').expect(200)).body;
    expect(f).toHaveLength(9);
    expect(f.find((x: any) => x.ref === 'F-008').statut_effectif).toBe('bloque');
    expect((await get('/projets/exemple-declarations/fonctionnalites?depot=mobile').expect(200)).body.every((x: any) => x.depots.some((d: any) => d.depot === 'mobile'))).toBe(true);
    const d = (await get('/projets/exemple-declarations/fonctionnalites/F-001').expect(200)).body;
    expect(d.tests.map((t: any) => t.ref)).toEqual(['RT-001', 'RT-002']);
    await get('/projets/exemple-declarations/fonctionnalites/F-999').expect(404);
  });

  it('documents, versions, journal paginé, registres, référentiels', async () => {
    const docs = (await get('/projets/exemple-declarations/documents?phase=conception').expect(200)).body;
    expect(docs.length).toBeGreaterThan(0);
    const sfd = (await get('/projets/exemple-declarations/documents/SFD').expect(200)).body;
    expect(sfd.version_courante.contenu.length).toBeGreaterThan(100);
    const j = (await get('/projets/exemple-declarations/journal?par_page=10&evt=commit').expect(200)).body;
    expect(j.elements.length).toBeLessThanOrEqual(10);
    expect(j.elements.every((e: any) => e.evt === 'commit')).toBe(true);
    for (const r of ['exigences', 'cas-test', 'campagnes', 'retours', 'jalons', 'risques', 'actions', 'changements', 'reunions', 'parties-prenantes', 'adr', 'changelog', 'doc-technique', 'sessions', 'tdr'])
      await get(`/projets/exemple-declarations/${r}`).expect(200);
    expect((await get('/projets/exemple-declarations/campagnes/R2').expect(200)).body.resultats).toHaveLength(6);
    const ref = (await get('/referentiels').expect(200)).body;
    expect(ref.statuts_fonctionnalite.find((s: any) => s.code === 'en_cours')).toMatchObject({ libelle: 'En cours', poids: 0.3 });
    expect((await get('/modeles/sfd').expect(200)).body.contenu).toContain('#');
  });

  it('cloisonnement : un développeur non membre ne voit pas le projet', async () => {
    expect((await get('/projets', dev).expect(200)).body).toEqual([]);
    await get('/projets/exemple-declarations/indicateurs', dev).expect(404);
  });
});
