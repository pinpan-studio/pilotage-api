<!-- pilotage:debut — bloc géré par claude-kit/installer.mjs (pilotage-api), ne pas modifier à la main -->
## Pilotage du projet

Ce dépôt fait partie d'un projet suivi dans l'application **Pilotage** (projet et dépôt :
`.claude/pilotage.json`). Tu y accèdes par le serveur MCP **`pilotage`**, authentifié par la
variable d'environnement `PILOTAGE_TOKEN` (configuré pour Claude Code, Cursor, VS Code / Copilot,
Gemini CLI, Windsurf ; Codex : `~/.codex/config.toml`).

1. **Début de travail** : appelle `etat_projet` (indicateurs, fonctionnalités en cours, alertes),
   puis `demarrer_session` ; garde le `session_id` renvoyé.
2. **Périmètre** : le TDR (`lire_tdr`) et les fonctionnalités (`lister_fonctionnalites`) font
   référence. Identifie la fonctionnalité concernée (F-xxx) ; signale ce qui sort du périmètre.
3. **Commits** : préfixe chaque message par l'id de la fonctionnalité : `[F-012] …`.
4. **Au fil de l'eau** : `ajouter_note_session` pour les décisions et points ouverts.
5. **Documentation** (après un lot de modifications ou un commit) : `maj_statut_fonctionnalite`
   (avec `depot`), `ecrire_doc_technique`, `ajouter_entree_changelog`, `ajouter_adr` si une décision
   structurante a été prise, `ecrire_document` pour les documents de gestion (SFD, DAT…).
6. **Fin de travail** : `cloturer_session` avec un résumé (réalisé, décisions, points ouverts, suite).

Limites appliquées par l'API (inutile de les contourner) : jamais de validation ni de signature
d'une fonctionnalité ou d'un document, pas de modification du TDR ni des exigences, aucune
suppression, aucune décision sur une demande de changement. Un document validé ne se modifie
pas : `ecrire_document` crée une nouvelle version qui repasse en revue.
<!-- pilotage:fin -->
