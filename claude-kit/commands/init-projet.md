---
description: Initialise le pilotage à partir du TDR / cahier des charges (exigences, fonctionnalités, jalons)
argument-hint: chemin/vers/le-tdr.(pdf|docx|md)
---

Initialise le pilotage du projet (`.claude/pilotage.json`) à partir du document de cadrage : $ARGUMENTS

Le TDR et les exigences sont **protégés** : l'API refuse que l'agent les modifie tant qu'un
chef de projet n'a pas ouvert une « révision du périmètre » dans l'interface. Vérifie-le
d'abord (`etat_projet`, `lire_tdr`).

1. Lis le TDR (.docx → texte via `pandoc` ; PDF lu directement).
2. Prépare sa version Markdown fidèle (titres et numérotation d'origine conservés).
3. Extrais les exigences : une exigence = un besoin vérifiable (`EX-01…`, titre, section_tdr,
   priorité : « doit » → must, « devrait » → should, « pourra » → could, description).
4. Propose les fonctionnalités : titre, exigences liées, lot, poids (1, 2, 3, 5, 8), dépôts
   concernés. Chaque exigence doit être couverte par au moins une fonctionnalité.
5. Repère les livrables documentaires exigés, les jalons (dates, documents attendus, tranches
   de paiement), les parties prenantes (fonctions, pas de coordonnées) et les risques visibles.
6. Si la révision du périmètre est ouverte, enregistre via les outils MCP ; sinon, présente le
   tout et demande au chef de projet de l'importer dans l'interface.
7. Récapitulatif : exigences → fonctionnalités (poids, lots), jalons, livrables retenus,
   risques initiaux (`ajouter_risque`), points ambigus à clarifier. **Attends ma validation.**
   Propose ensuite `/document NOTE-CADRAGE`.
