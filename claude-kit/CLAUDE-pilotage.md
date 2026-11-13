<!-- pilotage:debut — bloc géré par claude-kit/installer.mjs (pilotage-api), ne pas modifier à la main -->
## Pilotage du projet

Ce dépôt fait partie d'un projet suivi dans l'application **Pilotage**. Configuration :
`.claude/pilotage.json` (API, projet, dépôt). Accès : serveur MCP **`pilotage`** (`.mcp.json`),
authentifié par la variable d'environnement `PILOTAGE_TOKEN`.

- **Début de session** : le hook « [Pilotage] » injecte l'état du projet et l'identifiant de
  session. À défaut, appelle `etat_projet`.
- **Référence** : le TDR (`lire_tdr`) et les fonctionnalités (`lister_fonctionnalites`)
  définissent le périmètre. Avant de développer, identifie la ou les fonctionnalités
  concernées (F-xxx). Si la demande sort du périmètre, signale-le.
- **Commits** : préfixe chaque message par l'id de la fonctionnalité : `[F-012] …`.
- **Au fil de l'eau** : `ajouter_note_session` pour les décisions et points ouverts.
- **Documentation** : après un lot de modifications ou un commit, lance le sous-agent
  `documentaliste`. Un hook te le rappellera si tu l'oublies.
- **Skill** : `pilotage` (`.claude/skills/pilotage/`) décrit tous les outils et les cycles de travail.
- **Commandes** : `/init-projet`, `/maj-doc`, `/document`, `/compte-rendu`, `/registre`,
  `/recette`, `/retour-client`, `/avancement`, `/fin-session`.
- **Limites fixées par l'API** (inutile d'essayer de les contourner) : tu ne peux jamais
  valider ni signer une fonctionnalité ou un document, ni modifier le TDR ou les exigences,
  ni supprimer quoi que ce soit, ni décider d'une demande de changement.
- Un document validé ou signé ne se modifie pas : `ecrire_document` crée une nouvelle
  version qui repasse en revue.
<!-- pilotage:fin -->
