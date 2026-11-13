#!/usr/bin/env node
// Installe (ou met à jour) le kit Pilotage v2 dans un dépôt de code.
//
//   node claude-kit/installer.mjs --repo ../dgh-backend --api https://pilotage-api.exemple.com --projet dgh-declarations --depot backend [--clients tous|aucun|cursor,vscode,gemini,windsurf,agents]
// Sur le poste d'un collègue (le dépôt contient déjà .claude/pilotage.json) :
//   node claude-kit/installer.mjs --repo ../dgh-backend
//
// Le jeton d'API n'est JAMAIS écrit dans un fichier : chaque développeur définit PILOTAGE_TOKEN
// dans son environnement (créé dans l'interface, Administration → Jetons d'API).
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const repoArg = opt('repo');
// Assistants à configurer (en plus de Claude Code) : cursor, vscode, gemini, windsurf, agents (AGENTS.md) — ou « tous ».
const CLIENTS_CONNUS = ['cursor', 'vscode', 'gemini', 'windsurf', 'agents'];
const clientsArg = (opt('clients') || 'tous').toLowerCase();
const clients = clientsArg === 'tous' ? CLIENTS_CONNUS : clientsArg === 'aucun' ? [] : clientsArg.split(',').map((s) => s.trim()).filter((c) => CLIENTS_CONNUS.includes(c));
if (!repoArg) {
  console.error('Usage : node claude-kit/installer.mjs --repo <dépôt de code> [--api <URL de l’API>] [--projet <code>] [--depot <nom>]');
  process.exit(1);
}
const repo = resolve(repoArg);
if (!existsSync(repo)) { console.error(`Dépôt introuvable : ${repo}`); process.exit(1); }

const dClaude = join(repo, '.claude');
for (const d of ['hooks', 'agents', 'commands', 'skills/pilotage']) mkdirSync(join(dClaude, d), { recursive: true });
const lireJson = (c, d = {}) => { try { return JSON.parse(readFileSync(c, 'utf8')); } catch { return d; } };
const ecrireJson = (c, v) => writeFileSync(c, JSON.stringify(v, null, 2) + '\n');

// 1. Configuration partagée (versionnée) : API, projet, dépôt — aucun secret.
const fPartage = join(dClaude, 'pilotage.json');
const partage = lireJson(fPartage);
const api = (opt('api') || partage.api || '').replace(/\/$/, '');
const projet = opt('projet') || partage.projet;
const depot = opt('depot') || partage.depot;
if (!api || !projet || !depot) { console.error('Préciser --api, --projet et --depot (première installation dans ce dépôt).'); process.exit(1); }
ecrireJson(fPartage, { api, projet, depot });

// 2. Hook, sous-agent, commandes
copyFileSync(join(KIT, 'hooks', 'pilotage.mjs'), join(dClaude, 'hooks', 'pilotage.mjs'));
for (const d of ['agents', 'commands', 'skills/pilotage']) for (const f of readdirSync(join(KIT, d))) copyFileSync(join(KIT, d, f), join(dClaude, d, f));

// 3. Hooks dans .claude/settings.json (fusion sans doublon, anciens hooks v1 retirés)
const fSettings = join(dClaude, 'settings.json');
const settings = lireJson(fSettings);
settings.hooks ??= {};
const cmd = (evt) => `node "$CLAUDE_PROJECT_DIR/.claude/hooks/pilotage.mjs" ${evt}`;
const ajouterHook = (evenement, matcher, evt, timeout) => {
  settings.hooks[evenement] = (settings.hooks[evenement] ?? []).filter((g) => !(g.hooks || []).some((h) => h.command === cmd(evt)));
  const groupe = { hooks: [{ type: 'command', command: cmd(evt), timeout }] };
  if (matcher) groupe.matcher = matcher;
  settings.hooks[evenement].push(groupe);
};
ajouterHook('SessionStart', 'startup|resume|clear|compact', 'debut-session', 10);
ajouterHook('PostToolUse', 'Edit|Write|MultiEdit|NotebookEdit|Bash|Task|Agent|mcp__pilotage__.*', 'journal', 5);
ajouterHook('Stop', null, 'fin-tour', 5);
// Le serveur MCP du projet est approuvé pour ce dépôt.
settings.enabledMcpjsonServers = [...new Set([...(settings.enabledMcpjsonServers ?? []), 'pilotage'])];
ecrireJson(fSettings, settings);

// 4. Serveur MCP (.mcp.json) : le jeton est développé depuis PILOTAGE_TOKEN au lancement de Claude Code.
const fMcp = join(repo, '.mcp.json');
const mcp = lireJson(fMcp);
mcp.mcpServers ??= {};
mcp.mcpServers.pilotage = { type: 'http', url: `${api}/mcp`, headers: { Authorization: 'Bearer ${PILOTAGE_TOKEN}' } };
ecrireJson(fMcp, mcp);

// 4 bis. Autres assistants : configuration MCP du projet (jeton lu dans PILOTAGE_TOKEN, jamais écrit).
const urlMcp = `${api}/mcp`;
const fusionner = (fichier, cle, entree) => {
  mkdirSync(dirname(fichier), { recursive: true });
  const c = lireJson(fichier); c[cle] ??= {}; c[cle].pilotage = entree; ecrireJson(fichier, c);
};
if (clients.includes('cursor')) fusionner(join(repo, '.cursor', 'mcp.json'), 'mcpServers', { url: urlMcp, headers: { Authorization: 'Bearer ${env:PILOTAGE_TOKEN}' } });
if (clients.includes('vscode')) {
  const f = join(repo, '.vscode', 'mcp.json');
  fusionner(f, 'servers', { type: 'http', url: urlMcp, headers: { Authorization: 'Bearer ${input:pilotage-token}' } });
  const c = lireJson(f); c.inputs = (c.inputs ?? []).filter((i) => i.id !== 'pilotage-token');
  c.inputs.push({ type: 'promptString', id: 'pilotage-token', description: "Jeton d'API Pilotage (plt_…)", password: true }); ecrireJson(f, c);
}
if (clients.includes('gemini')) fusionner(join(repo, '.gemini', 'settings.json'), 'mcpServers', { httpUrl: urlMcp, headers: { Authorization: 'Bearer $PILOTAGE_TOKEN' }, timeout: 30000 });
if (clients.includes('windsurf')) fusionner(join(repo, '.windsurf', 'mcp_config.json'), 'mcpServers', { serverUrl: urlMcp, headers: { Authorization: 'Bearer ${env:PILOTAGE_TOKEN}' } });

// 5. Bloc d'instructions dans CLAUDE.md
const fClaude = join(repo, 'CLAUDE.md');
const bloc = readFileSync(join(KIT, 'CLAUDE-pilotage.md'), 'utf8').trim();
let md = existsSync(fClaude) ? readFileSync(fClaude, 'utf8') : '';
const re = /<!-- pilotage:debut[\s\S]*?<!-- pilotage:fin -->/;
md = re.test(md) ? md.replace(re, bloc) : (md ? md.trimEnd() + '\n\n' : '') + bloc + '\n';
writeFileSync(fClaude, md);
// AGENTS.md : instructions lues par Codex, Cursor, GitHub Copilot, Gemini CLI, Windsurf…
if (clients.includes('agents')) {
  const fAgents = join(repo, 'AGENTS.md');
  const blocAgents = readFileSync(join(KIT, 'AGENTS-pilotage.md'), 'utf8').trim();
  let a = existsSync(fAgents) ? readFileSync(fAgents, 'utf8') : '';
  a = re.test(a) ? a.replace(re, blocAgents) : (a ? a.trimEnd() + '\n\n' : '') + blocAgents + '\n';
  writeFileSync(fAgents, a);
}

// 6. .gitignore : fichiers locaux du kit v1 éventuels
const fIgnore = join(repo, '.gitignore');
let ignore = existsSync(fIgnore) ? readFileSync(fIgnore, 'utf8') : '';
for (const l of ['.claude/settings.local.json']) if (!ignore.split(/\r?\n/).includes(l)) ignore += (ignore && !ignore.endsWith('\n') ? '\n' : '') + l + '\n';
writeFileSync(fIgnore, ignore);

console.log(`Kit Pilotage v2 installé dans ${repo}
  API : ${api} · projet : ${projet} · dépôt : ${depot}
  À versionner : .claude/pilotage.json, .claude/settings.json, .claude/hooks/pilotage.mjs,
    .claude/agents/, .claude/commands/, .claude/skills/pilotage/, .mcp.json, CLAUDE.md
  Autres assistants configurés : ${clients.length ? clients.join(', ') : 'aucun'} (.cursor/, .vscode/mcp.json, .gemini/, .windsurf/, AGENTS.md)
  Sur chaque poste : définir PILOTAGE_TOKEN (jeton d'API personnel, jamais versionné), par ex. dans ~/.bashrc :
    export PILOTAGE_TOKEN=plt_…
  Puis ouvrir Claude Code dans ce dépôt : le message « [Pilotage] » doit apparaître au démarrage.
  File d'attente hors ligne : node .claude/hooks/pilotage.mjs etat-file   ·   envoi forcé : … envoyer`);
