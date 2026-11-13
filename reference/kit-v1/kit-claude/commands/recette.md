---
description: Génère les cas de test, ou enregistre les résultats d'une campagne de recette
argument-hint: "cas [F-xxx|lot]"  |  "campagne <id> <résultats en texte libre>"
---

Recette du projet. Demande : $ARGUMENTS

**Mode « cas »** (ou sans argument) — générer / compléter le cahier de recette :
- Pour chaque fonctionnalité `developpe` (ou celles indiquées) sans cas de test suffisants,
  ajoute des cas dans `04-recette/tests.yaml` : `id` (RT-xxx, prochain libre),
  `fonctionnalite`, `titre`, `preconditions`, `etapes` (liste), `attendu`.
- Couvre le cas nominal, les erreurs de saisie, les droits d'accès et les cas limites
  exigés par le TDR (`00-cadrage/tdr.md`). Formule les étapes pour un testeur non technique.

**Mode « campagne »** — enregistrer des résultats :
- Crée ou complète `04-recette/campagnes/<id>.yaml` (modèle : `<racine>/modeles/campagne.yaml`)
  avec un résultat par test : `ok`, `ko`, `reserve` ou `non_teste`, et un commentaire
  pour tout ce qui n'est pas `ok`.
- Pour chaque `ko`, propose de créer un retour (`/retour-client`) si le défaut vient du client,
  sinon note-le dans `notes` de la fonctionnalité.
- Puis lance le `documentaliste` : il passe en `recette` les fonctionnalités dont tous les
  tests sont `ok`.

Termine par `node <racine>/scripts/verifier.mjs <projet>` et un récapitulatif OK/KO/réserves.
