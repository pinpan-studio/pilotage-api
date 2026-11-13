import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { creerApp, creerOrg, creerUtilisateur } from './outils';
import { projection } from './projection';
import { seedCatalogue, KIT_V1 } from '../src/db/seed/catalogue';
import { ImportKitService } from '../src/import/import-kit.service';
import { IndicateursService } from '../src/indicateurs/indicateurs.service';
import { verifier } from '../src/indicateurs/calcul';
import { Projet } from '../src/db/entities';

const CODE = 'exemple-declarations';
const kit = (date: string) => JSON.parse(execFileSync('node', [join(__dirname, 'kit-reference.mjs'), CODE, date], { encoding: 'utf8' }));

describe('Import du kit v1 et IndicateursService (portage à l’identique de pilotage.mjs)', () => {
  let app: INestApplication; let db: DataSource; let projet: Projet; let bilan: any;

  beforeAll(async () => {
    ({ app, db } = await creerApp());
    const org = await creerOrg(db, 'principale');
    const admin = await creerUtilisateur(db, org, 'admin@exemple.ci', 'admin');
    await seedCatalogue(db.manager, org.id);
    const r = await app.get(ImportKitService).importerDossier(
      { utilisateur_id: admin.id, organisation_id: org.id, nom: 'admin', role: 'admin', auteur_type: 'humain' },
      join(KIT_V1, 'projets', CODE));
    bilan = r.bilan;
    projet = await db.getRepository(Projet).findOneByOrFail({ id: r.projet.id });
  });
  afterAll(() => app.close());

  it('importe intégralement le projet d’exemple', () => {
    expect(bilan).toMatchObject({ depots: 3, fonctionnalites: expect.any(Number), campagnes: 2, retours: 4 });
    expect(bilan.evenements_journal).toBeGreaterThan(0);
    expect(bilan.versions_documents).toBeGreaterThan(0);
  });

  it('critère phase 1 : avancement 43 %, couverture 100 %, recette OK 67 %, 2 retours ouverts', async () => {
    const { indicateurs: m } = await app.get(IndicateursService).calculer(projet, '2026-11-13');
    expect(Math.round(m.avancement * 100)).toBe(43);
    expect(m.couverture).toBe(1);
    expect(Math.round(m.tauxRecette * 100)).toBe(67);
    expect(m.recette).toEqual({ ok: 4, ko: 0, reserve: 1, non_teste: 1 });
    expect(m.retoursOuverts.map((r: any) => r.id)).toHaveLength(2);
  });

  it.each(['2026-09-01', '2026-11-13', '2026-12-20', '2027-02-01'])('mêmes indicateurs et alertes que le kit v1 au %s', async (date) => {
    const ref = kit(date);
    const { modele, indicateurs } = await app.get(IndicateursService).calculer(projet, date);
    expect(projection(indicateurs)).toEqual(projection(ref.indicateurs));
    expect(verifier(modele).erreurs).toEqual(ref.verification.erreurs);
  });
});
