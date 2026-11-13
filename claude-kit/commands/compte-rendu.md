---
description: Rédige le compte rendu d'une réunion à partir de notes, et alimente les registres (actions, décisions, risques, changements)
argument-hint: <type de réunion> <notes brutes, transcription ou résumé>
---

Rédige le compte rendu de cette réunion : $ARGUMENTS

1. Pars du modèle `lire_modele_document compte-rendu` (type : lancement, copil,
   comite-technique, atelier, recette, point-hebdo, autre). En-tête : date, lieu,
   participants (fonction et organisme), rédacteur.
2. Reformule les notes de façon claire et neutre. Distingue **décisions**, **actions**
   (qui, quoi, quand) et informations. N'invente ni décision ni échéance : `[À PRÉCISER]`.
3. Enregistre :
   - si l'outil `creer_compte_rendu` est disponible, utilise-le (il crée la réunion et
     alimente actions, risques et changements de façon transactionnelle) ;
   - sinon : chaque action → `ajouter_action` ; chaque risque → `ajouter_risque` ; actions
     annoncées comme faites → `maj_action … fait` si disponible ; et présente le CR pour
     qu'il soit saisi dans l'interface (Gestion → Comptes rendus).
   - Demande hors périmètre du TDR → `proposer_changement` si disponible (décision toujours
     « en analyse »), sinon signale-la.
4. Ne valide aucun document ni jalon toi-même : liste ce qui a été validé en séance pour que
   le chef de projet le reporte dans l'interface.
5. Affiche le CR et la liste des écritures faites.
