---
description: Rédige ou met à jour un document de gestion de projet (SFD, DAT, PV, manuel, plan de déploiement…)
argument-hint: <CODE du document> [précisions]   ex. "SFD lot 2", "PV-RECETTE R2", "MANUEL-UTILISATEUR"
---

Rédige ou mets à jour le document : $ARGUMENTS

Sans argument : exécute `node <racine>/scripts/documents.mjs <projet>` et propose les documents
à produire en priorité (échéances proches, jalon suivant, phase en cours), puis arrête-toi.

1. Trouve le document dans `<racine>/modeles/documents/catalogue.yaml` et dans
   `documents.yaml` du projet : titre, phase, emplacement (ou `fichier`), modèle, producteur.
   Si le producteur est « humain » (contrat, maquettes, charte…), ne rédige rien : demande le
   fichier ou le lien et renseigne `fichier` ou `lien` dans `documents.yaml`.
2. Pars du modèle `<racine>/modeles/documents/<modele>` (et de `_entete.md` pour l'en-tête et
   l'historique des versions). Suis les consignes `<!-- Agent : … -->` puis retire-les.
3. Alimente le contenu **uniquement** à partir des sources du projet : TDR, exigences,
   fonctionnalités, `02-technique/`, code des dépôts, recette, retours, registres de
   `07-gestion/`, CR de réunions, `etat.mjs` pour les chiffres. Ce qui manque est signalé
   `[À COMPLÉTER : …]` ; ce qui est déduit sans être écrit est signalé `[À VALIDER]`.
4. Si le document existe déjà, mets-le à jour : incrémente la version (0.x tant qu'il n'est
   pas validé), ajoute une ligne à l'historique, ne supprime pas les ajouts faits à la main.
5. Pour les PV (`signature: true`) : prépare le document à signer, mais ne coche aucune
   décision et ne remplis aucune signature.
6. Mets à jour `documents.yaml` : `statut: en_cours` (ou `en_revue` si le document est
   complet et prêt pour relecture), `version`. **Ne passe jamais à `valide` ou `signe`** :
   c'est fait par un humain après validation du client (scan signé dans
   `08-livrables/signes/<CODE>-<date>.pdf`).
7. Lance `node <racine>/scripts/verifier.mjs <projet>` puis résume : sections rédigées,
   points `[À COMPLÉTER]` et `[À VALIDER]` restants.

Pour un export Word ou PDF destiné au client : `pandoc 08-livrables/<fichier>.md -o <fichier>.docx`
(proposer la commande, ne pas installer de logiciel sans accord).
