import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { creerApp, creerOrg, creerUtilisateur } from './outils';

/** Objectif (§10) : tableau de bord < 1 s pour 500 fonctionnalités et 200 000 événements. Lancer avec PERF=1. */
(process.env.PERF ? describe : describe.skip)('Performance du tableau de bord', () => {
  let app: INestApplication; let db: DataSource; let http: any; let jeton: string;
  beforeAll(async () => {
    ({ app, db } = await creerApp()); http = app.getHttpServer();
    const org = await creerOrg(db, 'perf'); await creerUtilisateur(db, org, 'admin@perf.ci', 'admin');
    const [{ id: pid }] = await db.query(`INSERT INTO projet (organisation_id, code, nom) VALUES ($1, 'gros', 'Gros projet') RETURNING id`, [org.id]);
    const deps = await db.query(`INSERT INTO depot (organisation_id, projet_id, nom) SELECT $1, $2, d FROM unnest(ARRAY['backend','web','mobile']) d RETURNING id`, [org.id, pid]);
    await db.query(`INSERT INTO fonctionnalite (organisation_id, projet_id, ref, titre, jalon, poids, statut, ordre)
      SELECT $1, $2, 'F-' || lpad(i::text, 3, '0'), 'Fonctionnalité ' || i, 'Lot ' || (i % 5 + 1), (ARRAY[1,2,3,5,8])[i % 5 + 1], (ARRAY['a_faire','en_cours','developpe','recette','valide'])[i % 5 + 1], i
      FROM generate_series(1, 500) i`, [org.id, pid]);
    await db.query(`INSERT INTO fonctionnalite_depot (fonctionnalite_id, depot_id, statut) SELECT f.id, d.id, 'en_cours' FROM fonctionnalite f CROSS JOIN depot d WHERE f.projet_id = $1 AND d.projet_id = $1`, [pid]);
    await db.query(`INSERT INTO evenement_journal (cle_idempotence, organisation_id, projet_id, depot_id, ts, evt, fichier, fonctionnalites, auteur)
      SELECT gen_random_uuid(), $1, $2, ($3::uuid[])[i % 3 + 1], now() - (i || ' seconds')::interval, (ARRAY['modification','commande','commit'])[i % 3 + 1], 'src/f' || (i % 900) || '.ts',
        ARRAY['F-' || lpad((i % 500 + 1)::text, 3, '0')], 'dev'
      FROM generate_series(1, 200000) i`, [org.id, pid, deps.map((d: any) => d.id)]);
    await db.query('ANALYZE');
    jeton = (await request(http).post('/api/v1/auth/connexion').send({ email: 'admin@perf.ci', mot_de_passe: 'mdp' })).body.jeton_acces;
  }, 300000);
  afterAll(() => app.close());

  for (const route of ['indicateurs', 'alertes', 'fonctionnalites', 'etat', 'journal?par_page=50', 'tracabilite']) {
    it(`/projets/gros/${route}`, async () => {
      await request(http).get(`/api/v1/projets/gros/${route}`).set('Authorization', `Bearer ${jeton}`).expect(200); // chauffe
      const t = Date.now();
      await request(http).get(`/api/v1/projets/gros/${route}`).set('Authorization', `Bearer ${jeton}`).expect(200);
      const ms = Date.now() - t; console.log(`${route} : ${ms} ms`);
      expect(ms).toBeLessThan(1000);
    }, 120000);
  }
});
