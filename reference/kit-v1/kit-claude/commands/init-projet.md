---
description: Initialise le pilotage à partir du TDR / cahier des charges (exigences, fonctionnalités, fiche projet)
argument-hint: chemin/vers/le-tdr.(pdf|docx|md)
---

Initialise le pilotage du projet à partir du document de cadrage : $ARGUMENTS

Le dossier de pilotage est indiqué dans le contexte de session (« Dossier de pilotage : … »).

1. Lis le TDR. S'il s'agit d'un .docx, convertis-le en texte (ex. `pandoc` ou `python -m docx2txt`) ;
   s'il s'agit d'un PDF, lis-le directement.
2. Écris son contenu, fidèlement et structuré en Markdown, dans `00-cadrage/tdr.md`
   (titres et numérotation d'origine conservés — c'est la référence contractuelle).
3. Extrais les exigences dans `00-cadrage/exigences.yaml` : une exigence = un besoin
   vérifiable. Champs : `id` (EX-01…), `titre`, `section_tdr`, `priorite` (must/should/could
   selon le vocabulaire du TDR : « doit » → must, « devrait » → should, « pourra » → could),
   `description`.
4. Propose les fonctionnalités dans `01-fonctionnalites.yaml` : `id` (F-001…), `titre`,
   `exigences` liées, `jalon` (lots ou phases du TDR), `poids` (1, 2, 3, 5, 8 selon la
   complexité), `statut: a_faire`, `depots` (les dépôts concernés de `depots.yaml`, tous à
   `a_faire`), `origine: TDR`. Chaque exigence doit être couverte par au moins une fonctionnalité.
5. Complète `projet.yaml` (nom, client, description, dates si le TDR les donne) et rédige
   une première version de `02-technique/architecture-globale.md`.
6. **Documents** : repère dans le TDR la liste des livrables attendus (souvent une section
   « Livrables » ou « Rapports »). Ajuste `documents.yaml` : `sans_objet` pour ce qui n'est pas
   requis, `echeance` quand le TDR la donne, et ajoute avec `titre` + `phase` tout livrable
   exigé absent du catalogue.
7. **Planning** : crée les jalons dans `07-gestion/planning.yaml` (dates du TDR ou du contrat),
   avec les documents attendus à chaque jalon et les tranches de paiement s'il y en a.
8. **Parties prenantes** citées dans le TDR → `07-gestion/parties-prenantes.yaml` (fonctions,
   pas de coordonnées personnelles). **Risques** visibles dès le TDR (délais serrés,
   dépendances au client, intégrations) → `07-gestion/risques.yaml`.
9. Lance `node <racine>/scripts/verifier.mjs <projet>` et corrige les erreurs.
10. Présente-moi un récapitulatif : exigences → fonctionnalités (poids, lots), jalons,
    livrables documentaires retenus, risques initiaux, et les points du TDR ambigus à clarifier
    avec le client. **Attends ma validation** avant de considérer le cadrage comme définitif.
    Propose ensuite `/document NOTE-CADRAGE`.
