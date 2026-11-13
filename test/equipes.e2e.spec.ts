import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { creerApp, creerOrg, creerUtilisateur } from './outils';
import { seedCatalogue } from '../src/db/seed/catalogue';
import { VERIFICATEUR_GOOGLE } from '../src/auth/auth.service';

const fauxGoogle = { async verifier(c: string) { const [, sub, email] = c.split('|'); return { sub, email, email_verified: true, name: email, picture: undefined }; } };

describe('Équipes, invitations, rôles, création de projet', () => {
  let app: INestApplication; let db: DataSource; let http: any;
  let admin: string;
  const auth = (j: string) => ({ Authorization: `Bearer ${j}` });
  const google = async (sub: string, email: string) => (await request(http).post('/api/v1/auth/google').send({ credential: `jeton-xxxxxxxxxxxxxxxxxxxx|${sub}|${email}` })).body;

  beforeAll(async () => {
    ({ app, db } = await creerApp([{ provide: VERIFICATEUR_GOOGLE, useValue: fauxGoogle }])); http = app.getHttpServer();
    const org = await creerOrg(db, 'principale');
    await seedCatalogue(db.manager, org.id);
    await creerUtilisateur(db, org, 'patron@gmail.com', 'admin');
    admin = (await google('g-patron', 'patron@gmail.com')).jeton_acces;
  });
  afterAll(() => app.close());

  it('créer un projet : documents du catalogue, créateur chef de projet ; développeur refusé', async () => {
    const r = (await request(http).post('/api/v1/projets').set(auth(admin)).send({ code: 'dgh-portail', nom: 'Portail DGH', client: 'DGH', date_debut: '2026-12-01', depots: [{ nom: 'backend', stack: 'NestJS' }, { nom: 'web' }] }).expect(201)).body;
    expect(r.nb_documents).toBe(41);
    await request(http).post('/api/v1/projets').set(auth(admin)).send({ code: 'dgh-portail', nom: 'Doublon' }).expect(409);
    await request(http).post('/api/v1/projets').set(auth(admin)).send({ code: 'Mauvais Code', nom: 'X' }).expect(400);
    const m = (await request(http).get('/api/v1/projets/dgh-portail/membres').set(auth(admin)).expect(200)).body;
    expect(m).toMatchObject([{ email: 'patron@gmail.com', role: 'chef_projet' }]);
    const ind = (await request(http).get('/api/v1/projets/dgh-portail/indicateurs').set(auth(admin)).expect(200)).body;
    expect(ind.avancement_documents).toBe(0);
  });

  it('inviter un membre, connexion Google de l’invité, rôle par projet', async () => {
    const inv = (await request(http).post('/api/v1/equipes/courante/membres').set(auth(admin)).send({ email: 'Dev@Gmail.com', role: 'developpeur' }).expect(201)).body;
    expect(inv.lien).toContain('invitation=dev%40gmail.com');
    expect(inv.membre).toMatchObject({ email: 'dev@gmail.com', role: 'developpeur', invite: true });
    await request(http).post('/api/v1/equipes/courante/membres').set(auth(admin)).send({ email: 'dev@gmail.com', role: 'developpeur' }).expect(409);
    const dev = (await google('g-dev', 'dev@gmail.com')).jeton_acces;
    expect(dev).toBeTruthy();
    // pas encore membre du projet (privé)
    await request(http).patch('/api/v1/projets/dgh-portail/visibilite').set(auth(admin)).send({ visibilite: 'membres' }).expect(200);
    await request(http).get('/api/v1/projets/dgh-portail').set(auth(dev)).expect(404);
    await request(http).post('/api/v1/equipes/courante/membres').set(auth(dev)).send({ email: 'x@gmail.com', role: 'admin' }).expect(403);
    await request(http).post('/api/v1/projets').set(auth(dev)).send({ code: 'perso', nom: 'Perso' }).expect(403);
    await request(http).put('/api/v1/projets/dgh-portail/membres').set(auth(admin)).send({ utilisateur_id: inv.membre.id, role: 'developpeur' }).expect(200);
    await request(http).get('/api/v1/projets/dgh-portail').set(auth(dev)).expect(200);
    await request(http).put('/api/v1/projets/dgh-portail/membres').set(auth(dev)).send({ utilisateur_id: inv.membre.id, role: 'chef_projet' }).expect(403);
    // dernier chef de projet : impossible de le retirer
    const moi = (await request(http).get('/api/v1/compte').set(auth(admin))).body;
    await request(http).delete(`/api/v1/projets/dgh-portail/membres/${moi.id}`).set(auth(admin)).expect(403);
    // changer le rôle d'équipe, désactiver
    expect((await request(http).patch(`/api/v1/equipes/courante/membres/${inv.membre.id}`).set(auth(admin)).send({ role: 'chef_projet' }).expect(200)).body.role).toBe('chef_projet');
    await request(http).patch(`/api/v1/equipes/courante/membres/${moi.id}`).set(auth(admin)).send({ role: 'developpeur' }).expect(403); // dernier admin
  });

  it('plusieurs équipes : créer, lister, changer d’espace (cloisonnement)', async () => {
    const e = (await request(http).post('/api/v1/equipes').set(auth(admin)).send({ nom: 'Studio Pinpan' }).expect(201)).body;
    expect(e).toMatchObject({ code: 'studio-pinpan', role: 'admin' });
    const l = (await request(http).get('/api/v1/equipes').set(auth(admin)).expect(200)).body;
    expect(l.map((x: any) => [x.nom, x.courante])).toEqual(expect.arrayContaining([['Studio Pinpan', false], ['principale', true]]));
    const s = (await request(http).post('/api/v1/equipes/changer').set(auth(admin)).send({ organisation_id: e.id }).expect(200)).body;
    expect((await request(http).get('/api/v1/projets').set(auth(s.jeton_acces)).expect(200)).body).toEqual([]);
    const l2 = (await request(http).get('/api/v1/equipes').set(auth(s.jeton_acces)).expect(200)).body;
    expect(l2.find((x: any) => x.courante).nom).toBe('Studio Pinpan');
    // une équipe dont on n'est pas membre
    const autre = await creerOrg(db, 'etrangere');
    await request(http).post('/api/v1/equipes/changer').set(auth(admin)).send({ organisation_id: autre.id }).expect(404);
    // Connexion par mot de passe après usage de la nouvelle équipe (sans mot de passe) : retrouve le compte qui en a un.
    const argon2 = await import('argon2');
    await db.query('UPDATE utilisateur SET mot_de_passe_hache = $1 WHERE email = $2 AND organisation_id <> $3', [await argon2.hash('secret'), 'patron@gmail.com', e.id]);
    await request(http).post('/api/v1/auth/connexion').send({ email: 'patron@gmail.com', mot_de_passe: 'secret' }).expect(200);
  });
});
