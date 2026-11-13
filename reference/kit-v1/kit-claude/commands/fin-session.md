---
description: Clôture la session de travail (résumé de session, doc à jour, commit du pilotage)
---

Clôture la session de développement :

1. Lance le sous-agent `documentaliste` pour mettre la doc à jour.
2. Rédige le résumé de session dans
   `03-journal/sessions/AAAA-MM-JJ-<depot>-<auteur>.md` à partir du modèle
   `<racine>/modeles/session.md` : réalisé, fichiers/modules touchés, décisions, problèmes
   et points ouverts, prochaines étapes. Base-toi sur la conversation, `git log` du jour
   et le journal `03-journal/actions/`. Si un fichier du jour existe déjà, complète-le.
3. Dans le dépôt de pilotage (la racine du kit) : `git pull --rebase` puis
   `git add projets/<projet>` et commit avec le message
   `pilotage(<projet>): session <date> <depot>`.
4. Demande-moi si je veux pousser (`git push`) — ne pousse pas sans mon accord.
5. Affiche l'état du projet : `node <racine>/scripts/etat.mjs <projet>`.
