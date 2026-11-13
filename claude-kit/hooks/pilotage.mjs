#!/usr/bin/env node
// Hooks de pilotage v2 — copié par l'installeur dans <dépôt de code>/.claude/hooks/pilotage.mjs
// Usage (par Claude Code) : node .claude/hooks/pilotage.mjs <journal|debut-session|fin-tour|envoyer>
//
// Principes :
// - ne bloque JAMAIS le développement : délai réseau court (≤ 2 s), toute erreur → sortie silencieuse ;
// - chaque événement est d'abord écrit dans une file locale (~/.pilotage/file-attente.jsonl), puis envoyé
//   par lots à POST /api/v1/journal ; la file est vidée au prochain envoi réussi ;
// - chaque événement porte une cle_idempotence (uuid) : un renvoi après coupure ne crée pas de doublon ;
// - le jeton est lu dans la variable d'environnement PILOTAGE_TOKEN (jamais dans un fichier versionné).
// Aucune dépendance : Node.js 18+ uniquement.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { homedir, tmpdir, userInfo } from 'node:os';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const DELAI_MS = Number(process.env.PILOTAGE_DELAI_MS || 2000);
const LOT = 200;
const RE_IDS = /\b(?:F|EX|RT|RC|ADR)-\d{2,4}\b/g;
const LECTURE_SEULE = /^\s*(ls|ll|cat|less|head|tail|grep|rg|find|pwd|echo|which|type|wc|tree|stat|file|du|df|env|printenv|cd)\b|^\s*git\s+(status|diff|log|show|branch|remote|fetch|blame)\b/;
const OUTILS_DOC = /^mcp__pilotage__(ecrire_document|ecrire_doc_technique|maj_statut_fonctionnalite|ajouter_adr|ajouter_entree_changelog|cloturer_session)$/;

export const dossierLocal = () => process.env.PILOTAGE_DOSSIER || join(homedir(), '.pilotage');
const fichierFile = () => join(dossierLocal(), 'file-attente.jsonl');

// ------------------------------------------------------------------ utilitaires

const lireJson = (c, d = {}) => { try { return JSON.parse(readFileSync(c, 'utf8')); } catch { return d; } };
export const slug = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'inconnu';

export function masquer(texte) {
  return String(texte)
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/=-]+/gi, '$1 ***')
    .replace(/((?:password|passwd|pwd|secret|token|api[_-]?key|authorization)\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi, '$1***')
    .replace(/(\s-p)([^\s-]\S{2,})/g, '$1***')
    .replace(/\b(ghp|gho|github_pat|sk|pk|xox[abp]|plt)[-_][A-Za-z0-9_\-]{10,}/g, '***')
    .replace(/(https?:\/\/)[^\s/:@]+:[^\s/@]+@/g, '$1***@');
}

function auteur(repo) {
  try {
    const n = execFileSync('git', ['-C', repo, 'config', 'user.name'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (n) return n;
  } catch { /* pas de git */ }
  try { return userInfo().username; } catch { return 'inconnu'; }
}

// État d'une session Claude Code (compteur de modifications non documentées, session_id Pilotage).
const fichierEtat = (session) => join(tmpdir(), `pilotage-${slug(session || 'sans-session')}.json`);
const lireEtat = (session) => lireJson(fichierEtat(session), { modifsCode: 0, fichiers: [], commit: false });
const ecrireEtat = (session, etat) => { try { writeFileSync(fichierEtat(session), JSON.stringify(etat)); } catch { /* ignore */ } };

async function appeler(config, chemin, { methode = 'GET', corps } = {}) {
  const jeton = process.env.PILOTAGE_TOKEN;
  if (!jeton) throw new Error('PILOTAGE_TOKEN absent');
  const r = await fetch(`${config.api.replace(/\/$/, '')}/api/v1${chemin}`, {
    method: methode,
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: corps ? JSON.stringify(corps) : undefined,
    signal: AbortSignal.timeout(DELAI_MS),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ------------------------------------------------------------------ file d'attente hors ligne

export function mettreEnFile(evenement) {
  mkdirSync(dossierLocal(), { recursive: true });
  appendFileSync(fichierFile(), JSON.stringify(evenement) + '\n');
}

/** Verrou par création de dossier (atomique). Un verrou de plus de 30 s est considéré comme abandonné. */
function prendreVerrou() {
  const v = join(dossierLocal(), 'verrou');
  try { mkdirSync(v); return () => rmSync(v, { recursive: true, force: true }); } catch {
    try { if (Date.now() - statSync(v).mtimeMs > 30_000) { rmSync(v, { recursive: true, force: true }); mkdirSync(v); return () => rmSync(v, { recursive: true, force: true }); } } catch { /* ignore */ }
    return null;
  }
}

/** Envoie la file par lots. Les événements non envoyés restent dans la file. Retourne le nombre envoyé. */
export async function viderFile(config) {
  if (!existsSync(fichierFile())) return 0;
  const liberer = prendreVerrou();
  if (!liberer) return 0;
  const enCours = join(dossierLocal(), `envoi-${process.pid}.jsonl`);
  let envoyes = 0;
  try {
    // Les hooks concurrents continuent d'écrire dans une nouvelle file pendant l'envoi.
    renameSync(fichierFile(), enCours);
    const lignes = readFileSync(enCours, 'utf8').split('\n').filter(Boolean);
    const evenements = lignes.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    let i = 0;
    try {
      for (; i < evenements.length; i += LOT) {
        await appeler(config, '/journal', { methode: 'POST', corps: { evenements: evenements.slice(i, i + LOT) } });
        envoyes += Math.min(LOT, evenements.length - i);
      }
    } catch {
      // Réseau coupé : on remet le reste en tête de file.
      const reste = evenements.slice(i).map((e) => JSON.stringify(e) + '\n').join('');
      const nouveaux = existsSync(fichierFile()) ? readFileSync(fichierFile(), 'utf8') : '';
      writeFileSync(fichierFile(), reste + nouveaux);
    }
    rmSync(enCours, { force: true });
    if (envoyes) writeFileSync(join(dossierLocal(), 'derniere-synchro.json'), JSON.stringify({ ts: new Date().toISOString(), envoyes }));
  } catch { /* ignore */ } finally {
    liberer();
  }
  return envoyes;
}

// ------------------------------------------------------------------ hooks

const dans = (parent, enfant) => { const r = relative(parent, enfant); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };

/** PostToolUse : construit l'événement (même logique que journal.mjs du kit v1), le met en file et tente l'envoi. */
export async function journal({ entree, repo, config }) {
  const outil = entree.tool_name || '';
  const ti = entree.tool_input || {};
  const session = entree.session_id || '';
  const etat = lireEtat(session);
  etat.auteur ??= auteur(repo);
  const base = { cle_idempotence: randomUUID(), projet: config.projet, depot: config.depot, ts: new Date().toISOString(), auteur: etat.auteur, session_externe: session.slice(0, 8), outil };
  let ev = null;

  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(outil)) {
    const chemin = resolve(repo, ti.file_path || ti.notebook_path || '');
    const rel = dans(repo, chemin) ? relative(repo, chemin).split('\\').join('/') : chemin;
    ev = { ...base, evt: outil === 'Write' ? 'creation' : 'modification', fichier: rel };
    etat.modifsCode += 1;
    if (!etat.fichiers.includes(rel)) etat.fichiers.push(rel);
  } else if (outil === 'Bash') {
    const cmd = String(ti.command || '');
    if (/\bgit\s+(-C\s+\S+\s+)?commit\b/.test(cmd)) {
      let hash = '', message = '';
      try { [hash, message] = execFileSync('git', ['-C', repo, 'log', '-1', '--format=%h%x00%s'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\0'); } catch { /* ignore */ }
      ev = { ...base, evt: 'commit', hash, message: masquer(message).slice(0, 200), fonctionnalites: [...new Set(message.match(RE_IDS) || [])] };
      etat.commit = true;
    } else if (!LECTURE_SEULE.test(cmd)) {
      ev = { ...base, evt: 'commande', commande: masquer(cmd).slice(0, 300), fonctionnalites: [...new Set(cmd.match(RE_IDS) || [])] };
    }
  } else if (outil === 'Task' || outil === 'Agent') {
    const type = ti.subagent_type || '';
    ev = { ...base, evt: 'agent', message: `${type} : ${String(ti.description || '')}`.slice(0, 200) };
    if (type === 'documentaliste') { etat.modifsCode = 0; etat.fichiers = []; etat.commit = false; }
  } else if (OUTILS_DOC.test(outil)) {
    ev = { ...base, evt: 'doc', fichier: String(ti.code || ti.chemin || ti.ref || ''), fonctionnalites: ti.ref ? [ti.ref] : [] };
    etat.modifsCode = 0; etat.fichiers = []; etat.commit = false; // la documentation est en cours de mise à jour
  }

  ecrireEtat(session, etat);
  if (ev) {
    if (ev.fonctionnalites && !ev.fonctionnalites.length) delete ev.fonctionnalites;
    mettreEnFile(ev);
    await viderFile(config);
  }
  return null;
}

/** SessionStart : démarre une session Pilotage et injecte l'état du projet ; hors ligne → dernier état en cache. */
export async function debutSession({ entree, config }) {
  const session = entree.session_id || '';
  const cache = join(dossierLocal(), 'cache', `${slug(config.projet)}--${slug(config.depot)}.json`);
  const etat = lireEtat(session);
  let texte, horsLigne = false;
  try {
    const [s, e] = await Promise.all([
      etat.session_pilotage ? Promise.resolve({ session_id: etat.session_pilotage }) :
        appeler(config, '/sessions', { methode: 'POST', corps: { projet: config.projet, depot: config.depot, session_externe: session.slice(0, 8) } }),
      appeler(config, `/projets/${encodeURIComponent(config.projet)}/etat?depot=${encodeURIComponent(config.depot)}`),
    ]);
    etat.session_pilotage = s.session_id;
    etat.seuil = e.seuil_rappel_doc;
    texte = e.texte;
    mkdirSync(join(dossierLocal(), 'cache'), { recursive: true });
    writeFileSync(cache, JSON.stringify({ texte, seuil: e.seuil_rappel_doc, ts: e.genere_le }));
    viderFile(config).catch(() => {});
  } catch {
    horsLigne = true;
    const c = lireJson(cache, null);
    texte = c ? c.texte : '_État du projet indisponible (hors ligne, aucun cache)._';
    etat.seuil ??= c?.seuil;
    etat.cache_ts = c?.ts;
  }
  ecrireEtat(session, etat);
  return [
    `[Pilotage] Ce dépôt est le dépôt « ${config.depot} » du projet « ${config.projet} » (API ${config.api}).`,
    etat.session_pilotage ? `Session Pilotage : ${etat.session_pilotage} — utilise-la pour ajouter_note_session et cloturer_session (serveur MCP « pilotage »).` : null,
    horsLigne ? `HORS LIGNE : état mis en cache le ${etat.cache_ts || '?'} ; le journal est conservé localement et sera envoyé au retour du réseau.` : null,
    `Conventions : préfixer les messages de commit par l'id de la fonctionnalité, ex. "[F-012] ajout de l'export PDF". ` +
      `La documentation se met à jour par les outils MCP « pilotage » (sous-agent documentaliste).`,
    '',
    texte,
  ].filter((l) => l !== null).join('\n');
}

/** Stop : même logique de rappel que fin-tour.mjs du kit v1 (une seule fois par lot). */
export async function finTour({ entree, config }) {
  if (entree.stop_hook_active) return null;
  const session = entree.session_id || '';
  const etat = lireEtat(session);
  const seuil = Number(etat.seuil) || 8;
  viderFile(config).catch(() => {});
  if (!(etat.commit || etat.modifsCode >= seuil)) return null;
  const fichiers = etat.fichiers.slice(0, 15).join(', ');
  const aCommite = etat.commit;
  etat.modifsCode = 0; etat.fichiers = []; etat.commit = false;
  ecrireEtat(session, etat);
  return {
    decision: 'block',
    reason:
      `[Pilotage] Du code a été ${aCommite ? 'commité' : 'modifié'} sans mise à jour de la documentation du projet « ${config.projet} ». ` +
      `Lance maintenant le sous-agent "documentaliste" (outil Agent/Task, subagent_type "documentaliste") en lui indiquant ce qui vient d'être fait` +
      (fichiers ? ` (fichiers : ${fichiers})` : '') +
      `. Il mettra à jour, via le serveur MCP « pilotage », les statuts des fonctionnalités, la doc technique et le changelog. Ensuite seulement, rends la main à l'utilisateur.`,
  };
}

// ------------------------------------------------------------------ point d'entrée

async function lireEntree() {
  if (process.stdin.isTTY) return {};
  let data = '';
  for await (const m of process.stdin) data += m;
  try { return JSON.parse(data || '{}'); } catch { return {}; }
}

const estPrincipal = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (estPrincipal) {
  const evenement = process.argv[2];
  try {
    const entree = ['envoyer', 'etat-file'].includes(evenement) ? {} : await lireEntree();
    const repo = process.env.CLAUDE_PROJECT_DIR || entree.cwd || process.cwd();
    const config = { api: process.env.PILOTAGE_API, ...lireJson(join(repo, '.claude', 'pilotage.json')) };
    if (process.env.PILOTAGE_API) config.api = process.env.PILOTAGE_API;
    if (evenement === 'etat-file') {
      const n = existsSync(fichierFile()) ? readFileSync(fichierFile(), 'utf8').split('\n').filter(Boolean).length : 0;
      console.log(`${n} événement(s) en attente · dernière synchronisation : ${lireJson(join(dossierLocal(), 'derniere-synchro.json'), {}).ts || 'jamais'}`);
      process.exit(0);
    }
    if (!config.projet || !config.api) process.exit(0);
    const f = { journal, 'debut-session': debutSession, 'fin-tour': finTour, envoyer: async () => { const n = await viderFile({ ...config }); return evenement === 'envoyer' ? `${n} événement(s) envoyé(s).` : null; } }[evenement];
    if (!f) process.exit(0);
    const sortie = await f({ entree, repo, config });
    if (sortie) process.stdout.write(typeof sortie === 'string' ? sortie : JSON.stringify(sortie));
    process.exit(0);
  } catch (e) {
    process.stderr.write(`[pilotage] hook ${evenement} ignoré : ${e.message}\n`);
    process.exit(0);
  }
}
