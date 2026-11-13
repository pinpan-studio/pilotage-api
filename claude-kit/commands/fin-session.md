---
description: Clôture la session de travail (doc à jour, résumé de session)
---

Clôture la session de développement :

1. Lance le sous-agent `documentaliste` pour mettre la doc à jour.
2. Rédige le résumé de session à partir du modèle `lire_modele_document session` : réalisé,
   fichiers/modules touchés, décisions, problèmes et points ouverts, prochaines étapes.
   Base-toi sur la conversation, `git log` du jour et tes notes de session.
3. `cloturer_session` avec l'identifiant de session Pilotage donné en début de session
   (« Session Pilotage : … ») et ce résumé.
4. Vérifie que le journal local est bien parti : `node .claude/hooks/pilotage.mjs etat-file`
   (s'il reste des événements, le réseau est coupé : ils partiront au prochain envoi).
5. Affiche l'état du projet (`etat_projet`).
