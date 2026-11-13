---
description: Rédige le compte rendu d'une réunion à partir de notes, et alimente les registres (actions, décisions, risques, changements)
argument-hint: <type de réunion> <notes brutes, transcription ou résumé>
---

Rédige le compte rendu de cette réunion : $ARGUMENTS

1. Crée `07-gestion/reunions/AAAA-MM-JJ-<type>.md` à partir de
   `<racine>/modeles/documents/compte-rendu.md` (type : lancement, copil,
   comite-technique, atelier, recette, point-hebdo, autre). Renseigne l'en-tête :
   date, lieu, participants (fonction et organisme), rédacteur.
2. Reformule les notes de façon claire et neutre. Distingue bien **décisions**, **actions**
   (qui, quoi, quand) et simples informations. N'invente ni décision ni échéance : ce qui
   n'a pas été dit reste `[À PRÉCISER]`.
3. Alimente les registres de `07-gestion/` avec des ids cohérents avec le CR :
   - chaque action → `actions.yaml` (prochain id A-xxx, `origine` = chemin du CR) ;
   - chaque risque nouveau ou modifié → `risques.yaml` ;
   - chaque demande hors périmètre du TDR → `changements.yaml` (`decision: en_analyse`) ;
   - les actions précédentes annoncées comme faites → `statut: fait` ;
   - un jalon atteint → `date_reelle` dans `planning.yaml` ;
   - un document validé en séance → `statut: valide` et `date_validation` dans
     `documents.yaml` (seulement si la validation est explicite dans les notes).
4. Si c'est la réunion de lancement, mets à jour la ligne `PV-LANCEMENT` de `documents.yaml`
   (`fichier` = ce CR, `statut: en_revue`).
5. Lance `node <racine>/scripts/verifier.mjs <projet>`, puis affiche le CR et la liste des
   modifications faites dans les registres.
