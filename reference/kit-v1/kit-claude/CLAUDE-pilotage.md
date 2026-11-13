<!-- pilotage:debut — bloc géré par sc-pilotage/scripts/installer.mjs, ne pas modifier à la main -->
## Pilotage du projet

Ce dépôt fait partie d'un projet suivi dans le dépôt de pilotage (chemin donné en début
de session par le hook « [Pilotage] » ; sinon voir `.claude/pilotage.json` et
`.claude/pilotage.local.json`).

- **Référence** : le TDR (`00-cadrage/tdr.md`) et les fonctionnalités
  (`01-fonctionnalites.yaml`) définissent le périmètre. Avant de développer, identifie la
  ou les fonctionnalités concernées (F-xxx). Si la demande sort du périmètre, signale-le.
- **Commits** : préfixe chaque message par l'id de la fonctionnalité : `[F-012] …`.
- **Documentation** : après un lot de modifications ou un commit, lance le sous-agent
  `documentaliste`. Un hook te le rappellera si tu l'oublies.
- **Commandes** : `/init-projet`, `/maj-doc`, `/document`, `/compte-rendu`, `/registre`,
  `/recette`, `/retour-client`, `/avancement`, `/fin-session`.
- **Documents** : la liste des livrables à produire est dans `documents.yaml` (catalogue :
  `modeles/documents/catalogue.yaml`). Un document validé ou signé ne se modifie pas : on en
  fait une nouvelle version à faire valider.
- Ne modifie jamais le TDR ni le journal automatique (`03-journal/actions/`).
<!-- pilotage:fin -->
