// Hook PostToolUse : enregistre chaque action significative de l'agent dans le journal du projet.
import { execFileSync } from 'node:child_process';
import { relative, resolve, isAbsolute } from 'node:path';
import { dossierProjet, auteur, lireEtat, ecrireEtat, masquer, ajouterJournal } from './commun.mjs';

const RE_IDS = /\b(?:F|EX|RT|RC|ADR)-\d{2,4}\b/g;
const LECTURE_SEULE = /^\s*(ls|ll|cat|less|head|tail|grep|rg|find|pwd|echo|which|type|wc|tree|stat|file|du|df|env|printenv|cd)\b|^\s*git\s+(status|diff|log|show|branch|remote|fetch|blame)\b/;

const dans = (parent, enfant) => {
  const r = relative(parent, enfant);
  return r === '' || (!r.startsWith('..') && !isAbsolute(r));
};

export default async function ({ entree, repo, racine, projet, depot }) {
  const outil = entree.tool_name || '';
  const ti = entree.tool_input || {};
  const session = entree.session_id || '';
  const dirProjet = dossierProjet(racine, projet);
  const etat = lireEtat(session);
  etat.auteur ??= auteur(repo);

  const base = { ts: new Date().toISOString(), depot, auteur: etat.auteur, session: session.slice(0, 8), outil };
  let ligne = null;

  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(outil)) {
    const chemin = resolve(repo, ti.file_path || ti.notebook_path || '');
    if (dans(dirProjet, chemin)) {
      ligne = { ...base, evt: 'doc', fichier: relative(dirProjet, chemin).split('\\').join('/') };
      etat.modifsCode = 0; etat.fichiers = []; etat.commit = false; // la doc est en cours de mise à jour
    } else {
      const rel = relative(repo, chemin).split('\\').join('/');
      ligne = { ...base, evt: outil === 'Write' ? 'creation' : 'modification', fichier: rel };
      etat.modifsCode += 1;
      if (!etat.fichiers.includes(rel)) etat.fichiers.push(rel);
    }
  } else if (outil === 'Bash') {
    const cmd = String(ti.command || '');
    if (/\bgit\s+(-C\s+\S+\s+)?commit\b/.test(cmd)) {
      let hash = '', message = '';
      try {
        [hash, message] = execFileSync('git', ['-C', repo, 'log', '-1', '--format=%h%x00%s'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\0');
      } catch { /* ignore */ }
      ligne = { ...base, evt: 'commit', hash, message: masquer(message).slice(0, 200), fonctionnalites: [...new Set(message.match(RE_IDS) || [])] };
      etat.commit = true;
    } else if (!LECTURE_SEULE.test(cmd)) {
      ligne = { ...base, evt: 'commande', commande: masquer(cmd).slice(0, 300), fonctionnalites: [...new Set(cmd.match(RE_IDS) || [])] };
    }
  } else if (outil === 'Task' || outil === 'Agent') {
    const type = ti.subagent_type || '';
    ligne = { ...base, evt: 'agent', agent: type, description: String(ti.description || '').slice(0, 200) };
    if (type === 'documentaliste') { etat.modifsCode = 0; etat.fichiers = []; etat.commit = false; }
  }

  ecrireEtat(session, etat);
  if (ligne) {
    if (ligne.fonctionnalites && !ligne.fonctionnalites.length) delete ligne.fonctionnalites;
    ajouterJournal(dirProjet, depot, etat.auteur, ligne);
  }
  return null;
}
