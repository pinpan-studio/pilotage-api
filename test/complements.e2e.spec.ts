import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { creerApp, creerOrg, creerProjet, creerUtilisateur } from './outils';
import { seedCatalogue } from '../src/db/seed/catalogue';

/** TDR et révision de périmètre, suppression logique, parties prenantes, ADR, catalogue, journal filtré. */
describe('Compléments de saisie', () => {
  let app: INestApplication; let db: DataSource; let http: any; const j: Record<string, string> = {}; let dev: any;
  const P = '/api/v1/projets/c';
  const r = (t: string) => ({ get: (u: string) => request(http).get(P + u).set('Authorization', `Bearer ${t}`), put: (u: string, b: any) => request(http).put(P + u).set('Authorization', `Bearer ${t}`).send(b),
    post: (u: string, b: any) => request(http).post(P + u).set('Authorization', `Bearer ${t}`).send(b), patch: (u: string, b: any) => request(http).patch(P + u).set('Authorization', `Bearer ${t}`).send(b),
    del: (u: string) => request(http).delete(P + u).set('Authorization', `Bearer ${t}`) });
  const cnx = async (email: string) => (await request(http).post('/api/v1/auth/connexion').send({ email, mot_de_passe: 'mdp' })).body.jeton_acces;

  beforeAll(async () => {
    ({ app, db } = await creerApp()); http = app.getHttpServer();
    const org = await creerOrg(db, 'c'); await seedCatalogue(db.manager, org.id);
    await creerUtilisateur(db, org, 'admin@c.ci', 'admin');
    const chef = await creerUtilisateur(db, org, 'chef@c.ci', 'chef_projet');
    dev = await creerUtilisateur(db, org, 'dev@c.ci', 'developpeur');
    await creerProjet(db, org, 'c', [[chef, 'chef_projet'], [dev, 'developpeur']]);
    for (const e of ['admin', 'chef', 'dev']) j[e] = await cnx(`${e}@c.ci`);
    j.agent = (await request(http).post('/api/v1/jetons').set('Authorization', `Bearer ${j.admin}`).send({ utilisateur_id: dev.id, nom: 'agent' })).body.jeton;
  });
  afterAll(() => app.close());

  it('TDR : chef de projet ; agent seulement pendant une révision de périmètre', async () => {
    await r(j.dev).put('/tdr', { contenu: '# TDR' }).expect(403);
    await r(j.agent).put('/tdr', { contenu: '# TDR' }).expect(403);
    await r(j.chef).put('/tdr', { contenu: '# TDR\n\n## 1. Objet' }).expect(200);
    expect((await r(j.dev).get('/tdr').expect(200)).body.contenu).toContain('Objet');
    await r(j.dev).patch('/revision-perimetre', { ouverte: true }).expect(403);
    await r(j.chef).patch('/revision-perimetre', { ouverte: true }).expect(200);
    await r(j.agent).put('/tdr', { contenu: '# TDR révisé' }).expect(200);
    await r(j.agent).post('/exigences', { titre: 'Export PDF' }).expect(201);
    await r(j.chef).patch('/revision-perimetre', { ouverte: false }).expect(200);
    await r(j.agent).post('/exigences', { titre: 'Interdit' }).expect(403);
  });

  it('suppression logique : humains, chef pour le périmètre, historisée', async () => {
    await r(j.dev).post('/fonctionnalites', { titre: 'À supprimer' }).expect(201);
    const rq = await r(j.dev).post('/risques', { titre: 'Risque', probabilite: 1, impact: 1 }).expect(201);
    await r(j.agent).del(`/risques/${rq.body.ref}`).expect(403);
    await r(j.dev).del(`/risques/${rq.body.ref}`).expect(204);
    expect((await r(j.dev).get('/risques').expect(200)).body).toEqual([]);
    await r(j.dev).del('/fonctionnalites/F-001').expect(403);
    await r(j.chef).del('/fonctionnalites/F-001').expect(204);
    await r(j.chef).del('/fonctionnalites/F-001').expect(404);
    expect((await r(j.dev).get('/fonctionnalites').expect(200)).body).toEqual([]);
    const h = await db.query(`SELECT count(*)::int n FROM historique WHERE entite = 'fonctionnalite' AND champ = 'supprime_le'`);
    expect(h[0].n).toBe(1);
    // Une suppression d'un fichier passe toujours par sa propre route.
    const f = await request(http).delete(`${P}/fichiers/00000000-0000-0000-0000-000000000000`).set('Authorization', `Bearer ${j.dev}`);
    expect([403, 404]).toContain(f.status); expect(JSON.stringify(f.body)).not.toContain('type «');
  });

  it('parties prenantes et statut des décisions d’architecture', async () => {
    const pp = await r(j.dev).post('/parties-prenantes', { nom: 'Mme Koné', fonction: 'DRH', organisme: 'Client', influence: 'forte' }).expect(201);
    await r(j.dev).patch(`/parties-prenantes/${pp.body.id}`, { attentes: 'Tableau de bord mensuel' }).expect(200);
    expect((await r(j.dev).get('/parties-prenantes').expect(200)).body[0]).toMatchObject({ nom: 'Mme Koné', attentes: 'Tableau de bord mensuel' });
    const c = await request(http).post('/mcp').set('Authorization', `Bearer ${j.agent}`).set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'ajouter_adr', arguments: { projet: 'c', titre: 'PostgreSQL', contexte: 'x', decision: 'y' } } }).expect(200);
    expect(JSON.stringify(c.body)).toContain('ADR-001');
    await r(j.agent).patch('/adr/ADR-001/statut', { statut: 'acceptee' }).expect(403);
    await r(j.dev).patch('/adr/ADR-001/statut', { statut: 'acceptee' }).expect(403);
    await r(j.chef).patch('/adr/ADR-001/statut', { statut: 'acceptee' }).expect(200);
    expect((await r(j.dev).get('/adr').expect(200)).body[0].statut).toBe('acceptee');
  });

  it('catalogue documentaire : administrateur seulement', async () => {
    await request(http).patch('/api/v1/catalogue/SFD').set('Authorization', `Bearer ${j.chef}`).send({ titre: 'Titre valide' }).expect(403);
    await request(http).patch('/api/v1/catalogue/SFD').set('Authorization', `Bearer ${j.admin}`).send({ titre: 'Spécifications fonctionnelles', signature: true }).expect(200);
    await request(http).patch('/api/v1/catalogue/SFD').set('Authorization', `Bearer ${j.admin}`).send({ phase: 'inconnue' }).expect(400);
    await request(http).put('/api/v1/modeles/sfd').set('Authorization', `Bearer ${j.admin}`).send({ contenu: '# Modèle SFD v2' }).expect(200);
    expect((await request(http).get('/api/v1/modeles/sfd').set('Authorization', `Bearer ${j.dev}`).expect(200)).body.contenu).toBe('# Modèle SFD v2');
    const t = (await request(http).get('/api/v1/catalogue').set('Authorization', `Bearer ${j.dev}`).expect(200)).body.types.find((x: any) => x.code === 'SFD');
    expect(t).toMatchObject({ titre: 'Spécifications fonctionnelles', signature: true });
  });
});
