#!/usr/bin/env node
// Suivi documentaire d'un projet.
//   node scripts/documents.mjs <projet>                 → liste des documents et statuts
//   node scripts/documents.mjs <projet> --synchroniser  → ajoute les documents du catalogue absents de documents.yaml
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { chargerProjet, chargerCatalogue, documentsInitiaux, LIBELLES } from './lib/pilotage.mjs';

const [code, option] = process.argv.slice(2);
if (!code) { console.error('Usage : node scripts/documents.mjs <projet> [--synchroniser]'); process.exit(1); }
const p = chargerProjet(code);
const f = join(p.dir, 'documents.yaml');

if (option === '--synchroniser') {
  const texte = existsSync(f) ? readFileSync(f, 'utf8') : '';
  const doc = YAML.parseDocument(texte || '[]');
  const actuels = new Set((doc.toJS() || []).map((d) => d.code));
  const manquants = documentsInitiaux(chargerCatalogue()).filter((d) => !actuels.has(d.code));
  if (!manquants.length) { console.log('documents.yaml est à jour avec le catalogue.'); process.exit(0); }
  const entete = texte.split('\n').filter((l) => l.startsWith('#')).join('\n');
  const liste = [...(doc.toJS() || []), ...manquants];
  writeFileSync(f, (entete ? entete + '\n' : '') + YAML.stringify(liste));
  console.log(`${manquants.length} document(s) ajouté(s) : ${manquants.map((d) => d.code).join(', ')}`);
  process.exit(0);
}

const phases = chargerCatalogue().phases;
for (const ph of phases) {
  const l = p.suiviDocuments.filter((d) => d.phase === ph.code);
  if (!l.length) continue;
  console.log(`\n## ${ph.titre}`);
  for (const d of l) {
    console.log(`- ${d.code.padEnd(24)} ${(LIBELLES[d.statut] || d.statut).padEnd(12)} ${d.titre}${d.livrable ? ' [livrable]' : ''}${d.signature ? ' [à signer]' : ''}${d.existe ? '' : ' (fichier absent)'}${d.echeance ? ` — échéance ${d.echeance}` : ''}`);
  }
}
