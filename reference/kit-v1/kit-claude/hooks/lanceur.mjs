#!/usr/bin/env node
// Lanceur des hooks de pilotage — copié dans <dépôt de code>/.claude/hooks/pilotage.mjs
// Il localise le dépôt de pilotage puis délègue au hook correspondant, pour que la
// logique reste centralisée (une mise à jour du dépôt de pilotage suffit).
// Ne bloque JAMAIS le développement : en cas de problème, il sort silencieusement.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const evenement = process.argv[2]; // journal | fin-tour | debut-session

async function lireEntree() {
  let data = '';
  for await (const morceau of process.stdin) data += morceau;
  try { return JSON.parse(data || '{}'); } catch { return {}; }
}

function lireJson(chemin) {
  try { return JSON.parse(readFileSync(chemin, 'utf8')); } catch { return {}; }
}

try {
  const entree = await lireEntree();
  const repo = process.env.CLAUDE_PROJECT_DIR || entree.cwd || process.cwd();
  const partage = lireJson(join(repo, '.claude', 'pilotage.json'));      // versionné : projet, depot
  const local = lireJson(join(repo, '.claude', 'pilotage.local.json'));  // propre au poste : racine
  const racine = resolve(repo, local.racine || process.env.PILOTAGE_RACINE || '../sc-pilotage');
  const module = join(racine, 'kit-claude', 'hooks', `${evenement}.mjs`);

  if (!partage.projet || !existsSync(module)) process.exit(0);

  const { default: executer } = await import(pathToFileURL(module).href);
  const sortie = await executer({ entree, repo, racine, projet: partage.projet, depot: partage.depot || 'principal' });
  if (sortie) process.stdout.write(typeof sortie === 'string' ? sortie : JSON.stringify(sortie));
  process.exit(0);
} catch (e) {
  process.stderr.write(`[pilotage] hook ${evenement} ignoré : ${e.message}\n`);
  process.exit(0);
}
