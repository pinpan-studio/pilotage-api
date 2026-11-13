---
description: Génère les cas de test, ou enregistre les résultats d'une campagne de recette
argument-hint: "cas [F-xxx|lot]"  |  "campagne <id> <résultats en texte libre>"
---

Recette du projet. Demande : $ARGUMENTS

**Mode « cas »** (ou sans argument) — générer / compléter le cahier de recette :
- `lister_fonctionnalites statut=developpe` et `lister_cas_test` : pour chaque fonctionnalité
  sans cas de test suffisants, rédige des cas : titre, préconditions, étapes (liste), attendu.
- Couvre le cas nominal, les erreurs de saisie, les droits d'accès et les cas limites exigés
  par le TDR (`lire_tdr`). Formule les étapes pour un testeur non technique.
- Enregistre avec `creer_cas_test` si disponible ; sinon présente-les pour saisie dans
  l'interface (Recette).

**Mode « campagne »** — enregistrer des résultats :
- Un résultat par test : `ok`, `ko`, `reserve` ou `non_teste`, avec un commentaire pour tout
  ce qui n'est pas `ok`. Enregistre avec `enregistrer_resultats` si disponible ; sinon via
  l'interface (Recette → saisie en grille).
- Pour chaque `ko` : `creer_retour` si le défaut est remonté par le client, sinon note-le
  dans les notes de la fonctionnalité (`maj_statut_fonctionnalite … notes`).
- Puis lance le `documentaliste` : il passe en `recette` les fonctionnalités dont tous les
  tests sont `ok` (l'API le vérifie).

Termine par un récapitulatif OK/KO/réserves (`lire_campagne`).
