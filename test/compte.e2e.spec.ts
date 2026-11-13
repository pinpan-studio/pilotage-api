import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { creerApp, creerOrg, creerUtilisateur } from './outils';
import { VERIFICATEUR_GOOGLE } from '../src/auth/auth.service';
import { Utilisateur } from '../src/db/entities';

/** Faux Google : « jeton-<sub>-<email> » ; « jeton-non-verifie » → e-mail non vérifié. */
const fauxGoogle = {
  async verifier(c: string) {
    if (c === 'jeton-falsifie-xxxxxxxxxxxxxxx') throw new Error('signature invalide');
    const [, sub, email] = c.split('|');
    return { sub, email, email_verified: !c.includes('non-verifie'), name: 'Parfait Konan', picture: 'https://lh3.googleusercontent.com/a/photo' };
  },
};

describe('Connexion Google, profil et sessions', () => {
  let app: INestApplication; let db: DataSource; let http: any;
  const google = (sub: string, email: string, suffixe = '') => request(http).post('/api/v1/auth/google').set('User-Agent', 'Navigateur de test').send({ credential: `jeton-xxxxxxxxxxxxxxxxxxxx|${sub}|${email}${suffixe}` });

  beforeAll(async () => {
    ({ app, db } = await creerApp([{ provide: VERIFICATEUR_GOOGLE, useValue: fauxGoogle }])); http = app.getHttpServer();
    const org = await creerOrg(db, 'principale');
    await creerUtilisateur(db, org, 'Chef@Exemple.ci', 'chef_projet');
  });
  afterAll(() => app.close());

  it('configuration publique', async () => {
    process.env.GOOGLE_CLIENT_ID = '123.apps.googleusercontent.com';
    expect((await request(http).get('/api/v1/config').expect(200)).body).toMatchObject({ google_client_id: '123.apps.googleusercontent.com', version_api: 'v1' });
  });

  it('refuse un jeton falsifié, une adresse non vérifiée ou sans compte', async () => {
    await request(http).post('/api/v1/auth/google').send({ credential: 'jeton-falsifie-xxxxxxxxxxxxxxx' }).expect(401);
    await google('s1', 'chef@exemple.ci', '|non-verifie').expect(401);
    const r = await google('s9', 'inconnu@gmail.com').expect(401);
    expect(r.body.message).toMatch(/Aucun compte Pilotage pour inconnu@gmail.com/);
  });

  it('connexion Google (e-mail insensible à la casse), liaison du compte, profil', async () => {
    const s = (await google('sub-chef', 'chef@exemple.ci').expect(200)).body;
    expect(s.utilisateur.photo_url).toContain('googleusercontent');
    const u = await db.getRepository(Utilisateur).findOneByOrFail({ email: 'Chef@Exemple.ci' });
    expect(u.google_sub).toBe('sub-chef');
    // Un autre compte Google avec la même adresse ne peut pas prendre le compte.
    await google('sub-pirate', 'chef@exemple.ci').expect(401);
    const p = (await request(http).get('/api/v1/compte').set('Authorization', `Bearer ${s.jeton_acces}`).expect(200)).body;
    expect(p).toMatchObject({ email: 'Chef@Exemple.ci', google_lie: true, organisation: { code: 'principale' } });
    const m = (await request(http).patch('/api/v1/compte').set('Authorization', `Bearer ${s.jeton_acces}`).send({ nom: 'Chef Projet' }).expect(200)).body;
    expect(m.nom).toBe('Chef Projet');
  });

  it('sessions : liste, session courante, rotation stable, révocation', async () => {
    const a = (await google('sub-chef', 'chef@exemple.ci').expect(200)).body;
    const b = (await request(http).post('/api/v1/auth/connexion').set('User-Agent', 'Autre poste').send({ email: 'chef@exemple.ci', mot_de_passe: 'mdp' }).expect(200)).body;
    const a2 = (await request(http).post('/api/v1/auth/rafraichir').send({ jeton_rafraichissement: a.jeton_rafraichissement }).expect(200)).body;
    const l = (await request(http).get('/api/v1/compte/sessions').set('Authorization', `Bearer ${a2.jeton_acces}`).expect(200)).body;
    const courante = l.find((s: any) => s.courante);
    expect(courante).toMatchObject({ methode: 'google', appareil: 'Navigateur de test' });
    expect(l.length).toBeGreaterThanOrEqual(3);
    const r = (await request(http).post('/api/v1/compte/sessions/revoquer-autres').set('Authorization', `Bearer ${a2.jeton_acces}`).expect(200)).body;
    expect(r.revoquees).toBeGreaterThanOrEqual(2);
    await request(http).post('/api/v1/auth/rafraichir').send({ jeton_rafraichissement: b.jeton_rafraichissement }).expect(401);
    const apres = (await request(http).get('/api/v1/compte/sessions').set('Authorization', `Bearer ${a2.jeton_acces}`).expect(200)).body;
    expect(apres).toHaveLength(1);
    await request(http).delete(`/api/v1/compte/sessions/${courante.id}`).set('Authorization', `Bearer ${a2.jeton_acces}`).expect(204);
    await request(http).post('/api/v1/auth/rafraichir').send({ jeton_rafraichissement: a2.jeton_rafraichissement }).expect(401);
  });
});
