// Hook Stop : si du code a été modifié (ou commité) sans mise à jour de la documentation,
// demande UNE fois à l'agent de lancer le documentaliste avant de rendre la main.
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { dossierProjet, lireEtat, ecrireEtat } from './commun.mjs';

export default async function ({ entree, racine, projet }) {
  if (entree.stop_hook_active) return null; // évite toute boucle
  const session = entree.session_id || '';
  const etat = lireEtat(session);

  let seuil = 8;
  try {
    const cfg = YAML.parse(readFileSync(join(dossierProjet(racine, projet), 'projet.yaml'), 'utf8'));
    seuil = Number(cfg?.agent?.seuil_rappel_doc) || seuil;
  } catch { /* défaut */ }

  if (!(etat.commit || etat.modifsCode >= seuil)) return null;

  const fichiers = etat.fichiers.slice(0, 15).join(', ');
  const aCommite = etat.commit;
  etat.modifsCode = 0; etat.fichiers = []; etat.commit = false; // un seul rappel par lot
  ecrireEtat(session, etat);

  return {
    decision: 'block',
    reason:
      `[Pilotage] Du code a été ${aCommite ? 'commité' : 'modifié'} sans mise à jour de la documentation du projet « ${projet} ». ` +
      `Lance maintenant le sous-agent "documentaliste" (outil Agent/Task, subagent_type "documentaliste") en lui indiquant ce qui vient d'être fait` +
      (fichiers ? ` (fichiers : ${fichiers})` : '') +
      `. Il mettra à jour les statuts des fonctionnalités, la doc technique et le changelog. Ensuite seulement, rends la main à l'utilisateur.`,
  };
}
