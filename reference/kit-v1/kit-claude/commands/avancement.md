---
description: Affiche l'avancement du projet, ou rédige un rapport d'avancement pour le client
argument-hint: [rapport]
---

1. Exécute `node <racine>/scripts/etat.mjs <projet>` et `node <racine>/scripts/verifier.mjs <projet>`.
2. Sans argument : présente l'état en quelques lignes (avancement, fonctionnalités en cours,
   alertes, retours ouverts).
3. Avec `rapport` ($ARGUMENTS) : rédige `06-rapports/AAAA-MM-JJ-rapport-avancement.md`
   destiné au client : synthèse, avancement global et par lot, fonctionnalités livrées
   depuis le dernier rapport (CHANGELOG), état de la recette, retours traités / en cours,
   risques et prochaines étapes. Ton professionnel, sans jargon technique ni détail interne
   (pas de noms de fichiers, pas de commandes). Les chiffres viennent **uniquement** de
   `etat.mjs`, jamais d'une estimation.
