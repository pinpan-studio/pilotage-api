---
description: Rédige ou met à jour un document de gestion de projet (SFD, DAT, PV, manuel, plan de déploiement…)
argument-hint: <CODE du document> [précisions]   ex. "SFD lot 2", "PV-RECETTE R2", "MANUEL-UTILISATEUR"
---

Rédige ou mets à jour le document : $ARGUMENTS

Sans argument : `lister_documents` et propose les documents à produire en priorité
(échéances proches, jalon suivant via `lister_jalons`, phase en cours), puis arrête-toi.

1. `lire_document <CODE>` : titre, phase, producteur, modèle, version courante. Si le
   producteur est « humain » (contrat, maquettes, charte…), ne rédige rien : l'API le refuse ;
   demande au chef de projet de téléverser le fichier ou le lien dans l'interface.
2. Pars du modèle (`lire_modele_document <modele>` et `_entete` pour l'en-tête et
   l'historique des versions). Suis les consignes `<!-- Agent : … -->` puis retire-les.
3. Alimente le contenu **uniquement** à partir des sources du projet : `lire_tdr`,
   `lister_exigences`, `lister_fonctionnalites`, `lire_doc_technique`, code des dépôts,
   recette, retours, registres, comptes rendus (`lire_reunion`), `etat_projet` pour les
   chiffres. Ce qui manque → `[À COMPLÉTER : …]` ; ce qui est déduit → `[À VALIDER]`.
4. Document existant : reprends le contenu courant, ne supprime pas les ajouts faits à la
   main, ajoute une ligne à l'historique des versions.
5. PV (signature) : prépare le document à signer, ne coche aucune décision, ne remplis
   aucune signature.
6. `ecrire_document` avec le contenu complet et un `resume_modif` ; `statut: en_revue` si le
   document est complet et prêt pour relecture, sinon `en_cours`. La validation et la
   signature (avec scan) se font dans l'interface par le chef de projet.
7. Résume : sections rédigées, points `[À COMPLÉTER]` et `[À VALIDER]` restants.

L'export Word/PDF se fait depuis l'interface (bouton « Exporter »).
