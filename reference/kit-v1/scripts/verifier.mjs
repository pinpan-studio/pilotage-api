#!/usr/bin/env node
// Vérifie la cohérence des fichiers d'un projet (ou de tous). Code de sortie 1 en cas d'erreur.
// Usage : node scripts/verifier.mjs [code-projet]
import { chargerProjet, listerProjets, verifier } from './lib/pilotage.mjs';

const codes = process.argv[2] ? [process.argv[2]] : listerProjets();
let ko = false;
for (const code of codes) {
  const { erreurs, avertissements } = verifier(chargerProjet(code));
  console.log(`\n== ${code} : ${erreurs.length} erreur(s), ${avertissements.length} avertissement(s)`);
  for (const e of erreurs) console.log(`  ✗ ${e}`);
  for (const a of avertissements) console.log(`  ! ${a}`);
  if (erreurs.length) ko = true;
}
process.exit(ko ? 1 : 0);
