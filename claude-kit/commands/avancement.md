---
description: Affiche l'avancement du projet, ou rédige un rapport d'avancement pour le client
argument-hint: [rapport]
---

1. `etat_projet` (et `lister_jalons`, `lister_retours`, `lister_risques` si utile).
2. Sans argument : présente l'état en quelques lignes (avancement, fonctionnalités en cours,
   alertes, retours ouverts).
3. Avec `rapport` ($ARGUMENTS) : rédige un rapport d'avancement destiné au client : synthèse,
   avancement global et par lot, fonctionnalités livrées depuis le dernier rapport
   (changelog), état de la recette, retours traités / en cours, risques et prochaines étapes.
   Ton professionnel, sans jargon technique ni détail interne (pas de noms de fichiers, pas
   de commandes). Les chiffres viennent **uniquement** d'`etat_projet`, jamais d'une estimation.
   Enregistre-le avec `ecrire_document RAPPORTS` (statut `en_revue`) : chaque rapport est une nouvelle version.
