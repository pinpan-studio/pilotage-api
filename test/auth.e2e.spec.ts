import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { creerApp, creerOrg, creerProjet, creerUtilisateur } from './outils';
import { AccesService } from '../src/common/acces.service';

describe('Authentification, jetons d’API et cloisonnement', () => {
  let app: INestApplication; let db: DataSource; let http: any;
  let ctx: any = {};

  beforeAll(async () => {
    ({ app, db } = await creerApp()); http = app.getHttpServer();
    const orgA = await creerOrg(db, 'a'); const orgB = await creerOrg(db, 'b');
    const admin = await creerUtilisateur(db, orgA, 'admin@a.ci', 'admin');
    const dev = await creerUtilisateur(db, orgA, 'dev@a.ci', 'developpeur');
    const adminB = await creerUtilisateur(db, orgB, 'admin@b.ci', 'admin');
    const p1 = await creerProjet(db, orgA, 'p1', [[dev, 'developpeur']]);
    const p2 = await creerProjet(db, orgA, 'p2');
    const pb = await creerProjet(db, orgB, 'pb');
    ctx = { orgA, admin, dev, adminB, p1, p2, pb };
  });
  afterAll(() => app.close());

  const connexion = async (email: string, mdp = 'mdp') => (await request(http).post('/api/v1/auth/connexion').send({ email, mot_de_passe: mdp })).body;

  it('refuse un mauvais mot de passe et les routes sans jeton', async () => {
    await request(http).post('/api/v1/auth/connexion').send({ email: 'admin@a.ci', mot_de_passe: 'faux' }).expect(401);
    const r = await request(http).get('/api/v1/auth/moi').expect(401);
    expect(r.body.message).toMatch(/Authentification requise/);
  });

  it('connexion, /moi et rotation du jeton de rafraîchissement', async () => {
    const s = await connexion('admin@a.ci');
    expect(s.expire_dans).toBe(900);
    const moi = await request(http).get('/api/v1/auth/moi').set('Authorization', `Bearer ${s.jeton_acces}`).expect(200);
    expect(moi.body).toMatchObject({ role: 'admin', auteur_type: 'humain' });
    const s2 = await request(http).post('/api/v1/auth/rafraichir').send({ jeton_rafraichissement: s.jeton_rafraichissement }).expect(200);
    expect(s2.body.jeton_rafraichissement).not.toBe(s.jeton_rafraichissement);
    await request(http).post('/api/v1/auth/rafraichir').send({ jeton_rafraichissement: s.jeton_rafraichissement }).expect(401);
  });

  it('jeton d’API : réservé à l’admin, affiché une fois, rôle agent, révocable', async () => {
    const dev = await connexion('dev@a.ci');
    await request(http).get('/api/v1/jetons').set('Authorization', `Bearer ${dev.jeton_acces}`).expect(403);
    const admin = await connexion('admin@a.ci');
    const c = await request(http).post('/api/v1/jetons').set('Authorization', `Bearer ${admin.jeton_acces}`)
      .send({ utilisateur_id: ctx.dev.id, nom: 'poste dev', projets: [ctx.p1.id, ctx.p2.id] }).expect(201);
    expect(c.body.jeton).toMatch(/^plt_[0-9a-f]{8}_/);
    const liste = await request(http).get('/api/v1/jetons').set('Authorization', `Bearer ${admin.jeton_acces}`).expect(200);
    expect(JSON.stringify(liste.body)).not.toContain(c.body.jeton);
    const moi = await request(http).get('/api/v1/auth/moi').set('Authorization', `Bearer ${c.body.jeton}`).expect(200);
    expect(moi.body).toMatchObject({ role: 'agent', auteur_type: 'agent', utilisateur_id: ctx.dev.id });

    // Cloisonnement : l'agent ne voit que les projets du jeton ET dont le développeur est membre.
    const acces = app.get(AccesService);
    expect((await acces.lister(moi.body)).map((p) => p.code)).toEqual(['p1']);
    await expect(acces.projet(moi.body, 'p2')).rejects.toThrow(/Introuvable/);

    await request(http).delete(`/api/v1/jetons/${c.body.id}`).set('Authorization', `Bearer ${admin.jeton_acces}`).expect(204);
    await request(http).get('/api/v1/auth/moi').set('Authorization', `Bearer ${c.body.jeton}`).expect(401);
    await request(http).get('/api/v1/auth/moi').set('Authorization', `Bearer ${c.body.jeton.slice(0, -2)}xx`).expect(401);
  });

  it('cloisonnement par organisation', async () => {
    const acces = app.get(AccesService);
    const adminA = { utilisateur_id: ctx.admin.id, organisation_id: ctx.orgA.id, nom: 'a', role: 'admin', auteur_type: 'humain' } as const;
    expect((await acces.lister(adminA)).map((p) => p.code)).toEqual(['p1', 'p2']);
    await expect(acces.projet(adminA, 'pb')).rejects.toThrow(/Introuvable/);
    const admin = await connexion('admin@a.ci');
    await request(http).post('/api/v1/jetons').set('Authorization', `Bearer ${admin.jeton_acces}`)
      .send({ utilisateur_id: ctx.adminB.id, nom: 'x', projets: [ctx.pb.id] }).expect(404);
  });
});
