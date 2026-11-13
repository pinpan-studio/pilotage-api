import 'reflect-metadata';
import * as argon2 from 'argon2';
import source from '../data-source';
import { Organisation, Utilisateur } from '../entities';
import { join } from 'node:path';
import { KIT_V1, seedCatalogue } from './catalogue';
import { ImportKitService } from '../../import/import-kit.service';
import { Projet } from '../entities';

/** Seed : organisation, administrateur initial, catalogue de documents et modèles. */
async function main() {
  await source.initialize();
  await source.transaction(async (em) => {
    const code = process.env.ORGANISATION_CODE ?? 'principale';
    let org = await em.findOneBy(Organisation, { code });
    if (!org) org = await em.save(em.create(Organisation, { code, nom: process.env.ORGANISATION_NOM ?? 'Organisation principale' }));

    const email = process.env.ADMIN_EMAIL;
    const mdp = process.env.ADMIN_MOT_DE_PASSE;
    if (email && mdp && !(await em.findOneBy(Utilisateur, { organisation_id: org.id, email }))) {
      await em.save(em.create(Utilisateur, {
        organisation_id: org.id, email, nom: 'Administrateur', role: 'admin',
        mot_de_passe_hache: await argon2.hash(mdp, { type: argon2.argon2id }),
      }));
      console.log(`Administrateur créé : ${email}`);
    }
    const r = await seedCatalogue(em, org.id);
    console.log(`Catalogue : ${r.phases} phases, ${r.types} types de documents, ${r.modeles} modèles.`);
  });
  // Données de démonstration : projet fictif « exemple-declarations » du kit v1 (SEED_DEMO=1).
  if (process.env.SEED_DEMO === '1') {
    const org = await source.getRepository(Organisation).findOneByOrFail({ code: process.env.ORGANISATION_CODE ?? 'principale' });
    if (await source.getRepository(Projet).findOneBy({ organisation_id: org.id, code: 'exemple-declarations' })) console.log('Démo déjà importée.');
    else {
      const admin = await source.getRepository(Utilisateur).findOneBy({ organisation_id: org.id, role: 'admin' });
      const r = await new ImportKitService(source).importerDossier(
        { utilisateur_id: admin?.id ?? org.id, organisation_id: org.id, nom: 'seed', role: 'admin', auteur_type: 'humain' },
        join(KIT_V1, 'projets', 'exemple-declarations'));
      console.log('Démo importée :', JSON.stringify(r.bilan));
    }
  }
  await source.destroy();
}
main().catch((e) => { console.error(e); process.exit(1); });
