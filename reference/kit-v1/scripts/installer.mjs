#!/usr/bin/env node
// Installe (ou met à jour) le kit de pilotage dans un dépôt de code.
//
// Première installation (par le chef de projet) :
//   node scripts/installer.mjs --projet dgh-declarations --depot backend --repo ../dgh-backend
// Sur le poste d'un collègue (le dépôt contient déjà .claude/pilotage.json) :
//   node scripts/installer.mjs --repo ../dgh-backend
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import YAML from 'yaml';
import { RACINE, DOSSIER_PROJETS } from './lib/pilotage.mjs';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const repoArg = opt('repo');
if (!repoArg) {
  console.error('Usage : node scripts/installer.mjs --repo <chemin du dépôt de code> [--projet <code>] [--depot <nom>]');
  process.exit(1);
}
const repo = resolve(repoArg);
if (!existsSync(repo)) { console.error(`Dépôt introuvable : ${repo}`); process.exit(1); }

const dClaude = join(repo, '.claude');
mkdirSync(join(dClaude, 'hooks'), { recursive: true });
mkdirSync(join(dClaude, 'agents'), { recursive: true });
mkdirSync(join(dClaude, 'commands'), { recursive: true });

const lireJson = (c, d = {}) => { try { return JSON.parse(readFileSync(c, 'utf8')); } catch { return d; } };
const ecrireJson = (c, v) => writeFileSync(c, JSON.stringify(v, null, 2) + '\n');

// 1. Configuration partagée (versionnée dans le dépôt de code)
const fPartage = join(dClaude, 'pilotage.json');
const partage = lireJson(fPartage);
const projet = opt('projet') || partage.projet;
const depot = opt('depot') || partage.depot;
if (!projet || !depot) { console.error('Préciser --projet et --depot (première installation dans ce dépôt).'); process.exit(1); }
const dirProjet = join(DOSSIER_PROJETS, projet);
if (!existsSync(dirProjet)) { console.error(`Projet ${projet} introuvable. Créez-le : node scripts/nouveau-projet.mjs ${projet}`); process.exit(1); }
ecrireJson(fPartage, { projet, depot });

// 2. Configuration locale (propre au poste, non versionnée)
ecrireJson(join(dClaude, 'pilotage.local.json'), { racine: RACINE });

// 3. Lanceur des hooks, sous-agent, commandes
copyFileSync(join(RACINE, 'kit-claude', 'hooks', 'lanceur.mjs'), join(dClaude, 'hooks', 'pilotage.mjs'));
for (const d of ['agents', 'commands']) {
  for (const f of readdirSync(join(RACINE, 'kit-claude', d))) copyFileSync(join(RACINE, 'kit-claude', d, f), join(dClaude, d, f));
}

// 4. Hooks dans .claude/settings.json (fusion sans doublon)
const fSettings = join(dClaude, 'settings.json');
const settings = lireJson(fSettings);
settings.hooks ??= {};
const cmd = (evt) => `node "$CLAUDE_PROJECT_DIR/.claude/hooks/pilotage.mjs" ${evt}`;
const ajouterHook = (evenement, matcher, evt) => {
  settings.hooks[evenement] ??= [];
  const existe = settings.hooks[evenement].some((g) => (g.hooks || []).some((h) => h.command === cmd(evt)));
  if (!existe) {
    const groupe = { hooks: [{ type: 'command', command: cmd(evt), timeout: 15 }] };
    if (matcher) groupe.matcher = matcher;
    settings.hooks[evenement].push(groupe);
  }
};
ajouterHook('SessionStart', 'startup|resume|clear|compact', 'debut-session');
ajouterHook('PostToolUse', 'Edit|Write|MultiEdit|NotebookEdit|Bash|Task|Agent', 'journal');
ajouterHook('Stop', null, 'fin-tour');
ecrireJson(fSettings, settings);

// 5. Accès au dossier de pilotage dans .claude/settings.local.json (propre au poste)
const fLocal = join(dClaude, 'settings.local.json');
const local = lireJson(fLocal);
local.permissions ??= {};
local.permissions.additionalDirectories ??= [];
if (!local.permissions.additionalDirectories.includes(RACINE)) local.permissions.additionalDirectories.push(RACINE);
ecrireJson(fLocal, local);

// 6. .gitignore
const fIgnore = join(repo, '.gitignore');
let ignore = existsSync(fIgnore) ? readFileSync(fIgnore, 'utf8') : '';
for (const l of ['.claude/pilotage.local.json', '.claude/settings.local.json']) {
  if (!ignore.split(/\r?\n/).includes(l)) ignore += (ignore && !ignore.endsWith('\n') ? '\n' : '') + l + '\n';
}
writeFileSync(fIgnore, ignore);

// 7. Bloc d'instructions dans CLAUDE.md
const fClaude = join(repo, 'CLAUDE.md');
const bloc = readFileSync(join(RACINE, 'kit-claude', 'CLAUDE-pilotage.md'), 'utf8').trim();
let md = existsSync(fClaude) ? readFileSync(fClaude, 'utf8') : '';
const re = /<!-- pilotage:debut[\s\S]*?<!-- pilotage:fin -->/;
md = re.test(md) ? md.replace(re, bloc) : (md ? md.trimEnd() + '\n\n' : '') + bloc + '\n';
writeFileSync(fClaude, md);

// 8. Déclarer le dépôt dans depots.yaml s'il n'y est pas
const fDepots = join(dirProjet, 'depots.yaml');
const texteDepots = existsSync(fDepots) ? readFileSync(fDepots, 'utf8') : '[]';
const depots = YAML.parse(texteDepots) || [];
if (!depots.some((d) => d.nom === depot)) {
  const entete = texteDepots.split('\n').filter((l) => l.startsWith('#')).join('\n');
  depots.push({ nom: depot, url: '', stack: '', role: '' });
  writeFileSync(fDepots, (entete ? entete + '\n' : '') + YAML.stringify(depots));
}
mkdirSync(join(dirProjet, '02-technique', depot), { recursive: true });

console.log(`Kit de pilotage installé dans ${repo}
  projet : ${projet} · dépôt : ${depot}
  À versionner dans le dépôt de code : .claude/pilotage.json, .claude/settings.json,
    .claude/hooks/pilotage.mjs, .claude/agents/, .claude/commands/, CLAUDE.md
  Ensuite : ouvrir Claude Code dans ce dépôt — le message « [Pilotage] » doit apparaître au démarrage.`);
