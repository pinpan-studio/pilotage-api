#!/usr/bin/env node
// Crée un projet à partir du modèle.
// Usage : node scripts/nouveau-projet.mjs <code> --nom "Nom du projet" --client "Client"
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { DOSSIER_PROJETS, documentsInitiaux } from './lib/pilotage.mjs';

export const ENTETE_DOCUMENTS = `# Suivi des documents du projet (référentiel : modeles/documents/catalogue.yaml).
# statut : a_produire | en_cours | en_revue | valide | signe | sans_objet
# Mettre « sans_objet » pour un document non requis par ce projet ; /init-projet ajuste la liste
# selon les livrables exigés par le TDR. Champs facultatifs : fichier (si autre emplacement),
# titre + phase (document hors catalogue), lien (URL si le document est rangé ailleurs : GED,
# Drive, Figma…), echeance, responsable, version, date_validation.
`;
const args = process.argv.slice(2);
const code = args[0];
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : ''; };
if (!code || !/^[a-z0-9][a-z0-9-]*$/.test(code)) {
  console.error('Usage : node scripts/nouveau-projet.mjs <code-en-minuscules> --nom "Nom" --client "Client"');
  process.exit(1);
}
const cible = join(DOSSIER_PROJETS, code);
if (existsSync(cible)) { console.error(`Le projet ${code} existe déjà.`); process.exit(1); }
cpSync(join(DOSSIER_PROJETS, '_modele'), cible, { recursive: true });

const f = join(cible, 'projet.yaml');
let y = readFileSync(f, 'utf8').replace('__CODE__', code);
if (opt('nom')) y = y.replace('"Nom du projet"', JSON.stringify(opt('nom')));
if (opt('client')) y = y.replace('"Nom du client"', JSON.stringify(opt('client')));
y = y.replace('date_debut: ""', `date_debut: "${new Date().toISOString().slice(0, 10)}"`);
writeFileSync(f, y);
writeFileSync(join(cible, 'documents.yaml'), ENTETE_DOCUMENTS + YAML.stringify(documentsInitiaux()));

console.log(`Projet créé : projets/${code}
Étapes suivantes :
  1. Déclarer les dépôts dans projets/${code}/depots.yaml
  2. Installer le kit dans chaque dépôt de code :
       node scripts/installer.mjs --projet ${code} --depot backend --repo ../mon-depot-backend
  3. Dans un dépôt de code, lancer Claude Code puis : /init-projet chemin/vers/le-tdr.pdf`);
