import request from 'supertest';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { creerApp, creerOrg, creerUtilisateur } from './outils';
import { seedCatalogue, KIT_V1 } from '../src/db/seed/catalogue';
import { ImportKitService } from '../src/import/import-kit.service';
import { MembreProjet } from '../src/db/entities';

describe('Suivi des tâches et kanban des fonctionnalités (REST)', () => {
  let app: INestApplication; let db: DataSource; let http: any; let dev: string; let lecteur: string; let chef: string;
  const P = '/api/v1/projets/exemple-declarations';
  beforeAll(async () => {
    ({ app, db } = await creerApp()); http = app.getHttpServer();
    const org = await creerOrg(db, 'principale');
    const admin = await creerUtilisateur(db, org, 'admin@exemple.ci', 'admin');
    const uDev = await creerUtilisateur(db, org, 'dev@exemple.ci', 'developpeur');
    const uLec = await creerUtilisateur(db, org, 'lecteur@exemple.ci', 'client_lecteur');
    const uChef = await creerUtilisateur(db, org, 'chef@exemple.ci', 'chef_projet');
    await seedCatalogue(db.manager, org.id);
    const { projet } = await app.get(ImportKitService).importerDossier({ utilisateur_id: admin.id, organisation_id: org.id, nom: 'admin', role: 'admin', auteur_type: 'humain' }, join(KIT_V1, 'projets', 'exemple-declarations'));
    await db.getRepository(MembreProjet).save([
      { organisation_id: org.id, projet_id: projet.id, utilisateur_id: uDev.id, role: 'developpeur' },
      { organisation_id: org.id, projet_id: projet.id, utilisateur_id: uLec.id, role: 'client_lecteur' },
      { organisation_id: org.id, projet_id: projet.id, utilisateur_id: uChef.id, role: 'chef_projet' },
    ]);
    const cnx = async (e: string) => (await request(http).post('/api/v1/auth/connexion').send({ email: e, mot_de_passe: 'mdp' })).body.jeton_acces;
    dev = await cnx('dev@exemple.ci'); lecteur = await cnx('lecteur@exemple.ci'); chef = await cnx('chef@exemple.ci');
  });
  afterAll(() => app.close());

  it('créer, déplacer, replanifier une tâche ; lecteur refusé', async () => {
    const t = (await request(http).post(`${P}/actions`).set('Authorization', `Bearer ${dev}`).send({ action: 'Préparer la recette du lot 2', responsable: 'Dev', echeance: '2026-11-30' }).expect(201)).body;
    expect(t).toMatchObject({ ref: 'A-006', statut: 'a_faire' });
    expect((await request(http).patch(`${P}/actions/A-006`).set('Authorization', `Bearer ${dev}`).send({ statut: 'en_cours', echeance: '2026-12-02' }).expect(200)).body).toMatchObject({ statut: 'en_cours', echeance: '2026-12-02' });
    expect((await request(http).patch(`${P}/actions/A-006`).set('Authorization', `Bearer ${dev}`).send({ echeance: null }).expect(200)).body.echeance).toBeNull();
    await request(http).patch(`${P}/actions/A-006`).set('Authorization', `Bearer ${dev}`).send({ statut: 'inconnu' }).expect(400);
    await request(http).post(`${P}/actions`).set('Authorization', `Bearer ${lecteur}`).send({ action: 'Intrusion' }).expect(403);
  });

  it('kanban des fonctionnalités : statut global et par dépôt ; validation réservée au chef de projet', async () => {
    expect((await request(http).patch(`${P}/fonctionnalites/F-007/statut`).set('Authorization', `Bearer ${dev}`).send({ statut: 'en_cours', depot: 'web' }).expect(200)).body).toMatchObject({ depot: 'web', statut: 'en_cours' });
    await request(http).patch(`${P}/fonctionnalites/F-001/statut`).set('Authorization', `Bearer ${dev}`).send({ statut: 'valide' }).expect(403);
    await request(http).patch(`${P}/fonctionnalites/F-001/statut`).set('Authorization', `Bearer ${chef}`).send({ statut: 'valide' }).expect(200);
  });
});
