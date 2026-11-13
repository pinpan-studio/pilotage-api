// Hook SessionStart : injecte dans le contexte de l'agent l'état du projet et l'emplacement du pilotage.
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { dossierProjet } from './commun.mjs';

export default async function ({ racine, projet, depot }) {
  const { resumeTexte } = await import(pathToFileURL(join(racine, 'scripts', 'etat.mjs')).href);
  const dir = dossierProjet(racine, projet);
  const { texte } = resumeTexte(projet, { depot });
  return [
    `[Pilotage] Ce dépôt est le dépôt « ${depot} » du projet « ${projet} ».`,
    `Dossier de pilotage (TDR, fonctionnalités, doc technique, recette, retours) : ${dir}`,
    `Racine du kit de pilotage : ${racine}`,
    `Conventions : préfixer les messages de commit par l'id de la fonctionnalité, ex. "[F-012] ajout de l'export PDF". ` +
      `La doc technique de ce dépôt se trouve dans ${join(dir, '02-technique', depot)}.`,
    '',
    texte,
  ].join('\n');
}
