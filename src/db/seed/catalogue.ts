import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { EntityManager } from 'typeorm';
import { ModeleDocument, PhaseDocument, TypeDocument } from '../entities';

/** Dossier du kit v1 (spécification exécutable). */
export const KIT_V1 = process.env.KIT_V1_DIR ?? join(__dirname, '..', '..', '..', 'reference', 'kit-v1');

/** Charge le catalogue des documents et tous les modèles Markdown pour une organisation (idempotent). */
export async function seedCatalogue(em: EntityManager, organisation_id: string) {
  const modeles = new Map<string, string>();
  const dossiers = [join(KIT_V1, 'modeles', 'documents'), join(KIT_V1, 'modeles')];
  for (const dir of dossiers) {
    for (const nom of readdirSync(dir)) {
      if (!/\.(md|ya?ml)$/.test(nom) || nom === 'catalogue.yaml') continue;
      modeles.set(nom, readFileSync(join(dir, nom), 'utf8'));
    }
  }
  const idsModeles = new Map<string, string>();
  for (const [code, contenu] of modeles) {
    let m = await em.findOneBy(ModeleDocument, { organisation_id, code });
    m = em.create(ModeleDocument, { ...(m ?? {}), organisation_id, code, contenu });
    m = await em.save(m);
    idsModeles.set(code, m.id);
  }

  const cat = YAML.parse(readFileSync(join(KIT_V1, 'modeles', 'documents', 'catalogue.yaml'), 'utf8'));
  for (const [ordre, p] of (cat.phases as any[]).entries()) {
    const ex = await em.findOneBy(PhaseDocument, { organisation_id, code: p.code });
    await em.save(em.create(PhaseDocument, { ...(ex ?? {}), organisation_id, code: p.code, titre: p.titre, ordre }));
  }
  for (const [ordre, d] of (cat.documents as any[]).entries()) {
    const ex = await em.findOneBy(TypeDocument, { organisation_id, code: d.code });
    await em.save(em.create(TypeDocument, {
      ...(ex ?? {}), organisation_id, ordre,
      code: d.code, titre: d.titre, phase: d.phase, producteur: d.producteur ?? 'mixte',
      livrable: !!d.livrable, signature: !!d.signature, recurrent: !!d.recurrent,
      modele_id: d.modele ? idsModeles.get(d.modele) ?? null : null,
      emplacement: d.emplacement ?? '', description: d.description ?? '',
    }));
  }
  return { modeles: modeles.size, types: cat.documents.length, phases: cat.phases.length };
}
