import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { creerApp, creerOrg, creerProjet, creerUtilisateur } from './outils';

/** Visibilité des projets dans l'équipe : equipe / equipe_lecture / membres ; clients et agents. */
describe('Visibilité des projets', () => {
  let app: INestApplication; let db: DataSource; let http: any; const j: Record<string, string> = {}; let ids: Record<string, string> = {};
  const cnx = async (email: string) => (await request(http).post('/api/v1/auth/connexion').send({ email, mot_de_passe: 'mdp' })).body.jeton_acces;
  const codes = async (t: string) => (await request(http).get('/api/v1/projets').set('Authorization', `Bearer ${t}`).expect(200)).body.map((p: any) => p.code).sort();
  const detail = (t: string, c: string) => request(http).get(`/api/v1/projets/${c}`).set('Authorization', `Bearer ${t}`);
  const action = (t: string, c: string) => request(http).post(`/api/v1/projets/${c}/actions`).set('Authorization', `Bearer ${t}`).send({ action: 'Tâche de test' });

  beforeAll(async () => {
    ({ app, db } = await creerApp()); http = app.getHttpServer();
    const org = await creerOrg(db, 'v'); const autre = await creerOrg(db, 'w');
    const admin = await creerUtilisateur(db, org, 'admin@v.ci', 'admin');
    const chef = await creerUtilisateur(db, org, 'chef@v.ci', 'chef_projet');
    const dev = await creerUtilisateur(db, org, 'dev@v.ci', 'developpeur');
    const client = await creerUtilisateur(db, org, 'client@v.ci', 'client_lecteur');
    await creerUtilisateur(db, autre, 'x@w.ci', 'admin');
    const ouvert = await creerProjet(db, org, 'ouvert', [[chef, 'chef_projet']]);
    const lecture = await creerProjet(db, org, 'lecture', [[chef, 'chef_projet']]);
    const prive = await creerProjet(db, org, 'prive', [[chef, 'chef_projet'], [client, 'client_lecteur']]);
    await creerProjet(db, autre, 'ailleurs');
    await db.query(`UPDATE projet SET visibilite = 'equipe_lecture' WHERE id = $1`, [lecture.id]);
    await db.query(`UPDATE projet SET visibilite = 'membres' WHERE id = $1`, [prive.id]);
    ids = { ouvert: ouvert.id, lecture: lecture.id, prive: prive.id, dev: dev.id };
    for (const e of ['admin', 'chef', 'dev', 'client']) j[e] = await cnx(`${e}@v.ci`);
    j.x = await cnx('x@w.ci');
  });
  afterAll(() => app.close());

  it('qui voit quoi', async () => {
    expect(await codes(j.admin)).toEqual(['lecture', 'ouvert', 'prive']);
    expect(await codes(j.chef)).toEqual(['lecture', 'ouvert', 'prive']);
    expect(await codes(j.dev)).toEqual(['lecture', 'ouvert']);
    expect(await codes(j.client)).toEqual(['prive']);
    expect(await codes(j.x)).toEqual(['ailleurs']);
    await detail(j.dev, 'prive').expect(404);
    await detail(j.client, 'ouvert').expect(404);
  });

  it('ce que chacun peut faire', async () => {
    expect((await detail(j.dev, 'ouvert').expect(200)).body).toMatchObject({ mon_role: 'developpeur', visibilite: 'equipe', membre: false });
    await action(j.dev, 'ouvert').expect(201);
    expect((await detail(j.dev, 'lecture').expect(200)).body).toMatchObject({ mon_role: 'client_lecteur', membre: false });
    await action(j.dev, 'lecture').expect(403);
    await action(j.chef, 'lecture').expect(201);
    // Non membre : pas de validation ni de gestion des membres, même en visibilité « équipe ».
    await request(http).patch('/api/v1/projets/ouvert/visibilite').set('Authorization', `Bearer ${j.dev}`).send({ visibilite: 'membres' }).expect(403);
  });

  it('changer la visibilité : chef du projet ou administrateur', async () => {
    await request(http).patch('/api/v1/projets/ouvert/visibilite').set('Authorization', `Bearer ${j.chef}`).send({ visibilite: 'invalide' }).expect(400);
    await request(http).patch('/api/v1/projets/ouvert/visibilite').set('Authorization', `Bearer ${j.chef}`).send({ visibilite: 'membres' }).expect(200);
    expect(await codes(j.dev)).toEqual(['lecture']);
    await request(http).patch('/api/v1/projets/ouvert/visibilite').set('Authorization', `Bearer ${j.admin}`).send({ visibilite: 'equipe' }).expect(200);
    expect(await codes(j.dev)).toEqual(['lecture', 'ouvert']);
  });

  it('les jetons (agent, OAuth) suivent leur titulaire', async () => {
    const agent = (await request(http).post('/api/v1/jetons').set('Authorization', `Bearer ${j.admin}`).send({ utilisateur_id: ids.dev, nom: 'agent' }).expect(201)).body.jeton;
    expect(await codes(agent)).toEqual(['lecture', 'ouvert']);
    await action(agent, 'ouvert').expect(201);
    await action(agent, 'lecture').expect(403);
    await detail(agent, 'prive').expect(404);
    const limite = (await request(http).post('/api/v1/jetons').set('Authorization', `Bearer ${j.admin}`).send({ utilisateur_id: ids.dev, nom: 'limité', projets: [ids.lecture] }).expect(201)).body.jeton;
    expect(await codes(limite)).toEqual(['lecture']);
  });
});
