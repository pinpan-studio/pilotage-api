// Outils partagés par les hooks.
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, userInfo } from 'node:os';
import { execFileSync } from 'node:child_process';

export function dossierProjet(racine, projet) {
  return join(racine, 'projets', projet);
}

export function auteur(repo) {
  try {
    const n = execFileSync('git', ['-C', repo, 'config', 'user.name'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (n) return n;
  } catch { /* pas de git */ }
  try { return userInfo().username; } catch { return 'inconnu'; }
}

export const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'inconnu';

// État d'une session (modifications de code non encore documentées).
const fichierEtat = (session) => join(tmpdir(), `pilotage-${slug(session || 'sans-session')}.json`);
export function lireEtat(session) {
  try { return JSON.parse(readFileSync(fichierEtat(session), 'utf8')); } catch { return { modifsCode: 0, fichiers: [], commit: false }; }
}
export function ecrireEtat(session, etat) {
  writeFileSync(fichierEtat(session), JSON.stringify(etat));
}

// Masque les secrets évidents dans une commande avant de la journaliser.
export function masquer(texte) {
  return String(texte)
    .replace(/((?:password|passwd|pwd|secret|token|api[_-]?key|authorization)\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi, '$1***')
    .replace(/(\s-p)([^\s-]\S{2,})/g, '$1***') // ex. mysql -pMOTDEPASSE
    .replace(/\b(ghp|gho|github_pat|sk|pk|xox[abp])[-_][A-Za-z0-9_\-]{10,}/g, '***')
    .replace(/(https?:\/\/)[^\s/:@]+:[^\s/@]+@/g, '$1***@');
}

export function ajouterJournal(dirProjet, depot, nomAuteur, entree) {
  const mois = entree.ts.slice(0, 7);
  const dossier = join(dirProjet, '03-journal', 'actions', mois);
  mkdirSync(dossier, { recursive: true });
  appendFileSync(join(dossier, `${slug(depot)}--${slug(nomAuteur)}.jsonl`), JSON.stringify(entree) + '\n');
}
