---
name: pilotage
description: Utiliser le serveur MCP « pilotage » (application Pilotage de suivi de projets) pour lire et mettre à jour un projet — état, TDR, fonctionnalités F-xxx, sessions de développement, statuts par dépôt, livrables documentaires, recette (cas de test RT-xxx, campagnes), retours clients RC-xxx, risques, actions, demandes de changement DC-xxx, comptes rendus, ADR, changelog. À charger dès que l'utilisateur parle de son projet suivi dans Pilotage, d'avancement, de fonctionnalité, de livrable, de recette, de retour client, de réunion ou de session de travail, ou quand des outils mcp__pilotage__* sont disponibles.
---

# Pilotage — bien utiliser le serveur MCP

Pilotage est la source de vérité du projet : périmètre (TDR, exigences), fonctionnalités, livrables,
recette, registres de gestion. Tu y accèdes par les outils `mcp__pilotage__*`. Toutes les réponses
sont en français : Markdown court + données structurées (`structuredContent.donnees`, d'où tu tires
les références `ref`, `session_id`…).

## Règles d'or

1. **Commence toujours par le contexte** : `lister_projets` si le code projet est inconnu, puis
   `etat_projet(projet, depot?)`. Ne devine jamais un code projet ni une référence : lis-les.
2. **Travaille dans une session** : `demarrer_session(projet, depot)` → garde le `session_id` et
   passe-le à **chaque écriture** (traçabilité). `ajouter_note_session` au fil de l'eau
   (décisions, points ouverts) ; `cloturer_session` à la fin, avec un résumé.
   Si un hook « [Pilotage] » a déjà injecté un `session_id`, réutilise-le au lieu d'en créer un.
3. **Rattache tout à une fonctionnalité F-xxx** : avant de coder, identifie-la
   (`lister_fonctionnalites`, `rechercher`). Hors périmètre → signale-le et propose
   `proposer_changement` plutôt que d'inventer une fonctionnalité.
4. **Respecte les limites — elles sont imposées par l'API, inutile de contourner** :
   jamais de validation ni de signature (statut `valide` d'une fonctionnalité, `valide`/`signe`
   d'un document), pas de modification du TDR ni des exigences, aucune suppression, aucune
   décision de changement (toujours « en analyse »), pas de campagne de recette client.
   Un refus commence par « Refusé : … » : explique-le à l'utilisateur et indique qui peut agir
   (chef de projet, administrateur).
5. **Format des données** : dates `AAAA-MM-JJ` ; poids d'une fonctionnalité 1, 2, 3, 5 ou 8 ;
   probabilité et impact d'un risque de 1 à 4 ; codes projet/dépôt en minuscules-tirets.
6. **Lis avant d'écrire** : `lire_document` avant `ecrire_document`, `lire_fonctionnalite` avant
   de changer un statut, `lister_cas_test` avant d'en créer (pas de doublons).
7. **Résume ce que tu as écrit** à l'utilisateur avec les références créées (F-008, RT-004, A-003…).

Connexion : jeton d'API (`Authorization: Bearer plt_…`) pour Claude Code, Cursor, etc. ; **OAuth** pour claude.ai et ChatGPT (connecteur avec l'URL `…/mcp`, consentement dans Pilotage). Le rôle effectif dépend du **jeton** : « agent » (restreint, défaut) ou un rôle humain plafonné par
son titulaire (lecteur = lecture seule ; `creer_projet` exige administrateur ou chef de projet).
Les écritures sont toujours marquées « Agent » dans l'historique.
Visibilité d'un projet (`creer_projet(visibilite)`) : `equipe` (défaut : toute l'équipe voit et contribue comme développeur), `equipe_lecture`, `membres` (privé). Un projet invisible répond « introuvable ».

## Cycles de travail

**Démarrer sur un projet** → `etat_projet` → `lire_tdr` + `lister_exigences` (ou `tracabilite` pour voir la couverture) →
`lister_fonctionnalites(lot?, statut?)` → résumer périmètre, avancement, bloquants.

**Session de développement**
1. `demarrer_session(projet, depot)` ; `lire_fonctionnalite(ref)` de la fonctionnalité visée.
2. `maj_statut_fonctionnalite(projet, ref, statut: en_cours, depot, session_id)` au démarrage.
3. Commits préfixés `[F-012] …` ; `ajouter_note_session(session_id, texte, fonctionnalites: [ref])`.
4. Décision structurante → `ajouter_adr` ; doc technique → `ecrire_doc_technique(depot, chemin)`.
5. Fin : statut `developpe` (par dépôt), `ajouter_entree_changelog(type, texte, fonctionnalite, version?)`,
   puis `cloturer_session(session_id, resume_md)` — fait / décisions / points ouverts / suite.

**Statuts d'une fonctionnalité** : `a_faire → en_cours → developpe → recette → (valide : humain)`,
plus `bloque` (avec `notes` expliquant la cause). Avec `depot`, seuls `a_faire | en_cours | bloque |
developpe` ; le statut global agrège les dépôts. `recette` n'est accepté que si **tous** ses cas
de test sont OK dans la dernière campagne.

**Recette**
1. `lister_fonctionnalites(statut: developpe)` + `lister_cas_test(fonctionnalite)`.
2. `creer_cas_test(fonctionnalite, titre, preconditions, etapes[], attendu)` : nominal, erreurs de
   saisie, droits d'accès, cas limites du TDR ; étapes compréhensibles par un testeur non technique.
3. `enregistrer_resultats(campagne: "R2", titre, date, resultats: [{cas_test, resultat: ok|ko|reserve|non_teste, commentaire}])`
   (la campagne est créée si la référence est nouvelle ; `lire_campagne` pour relire).
4. KO → `creer_retour(type: bug, fonctionnalites)` ; tout OK → `maj_statut_fonctionnalite(statut: recette)`.

**Livrables documentaires** : `lister_documents(phase?, statut?)` → `lire_modele_document(code)` →
`lire_document(code)` → rassembler (TDR, fonctionnalités, registres) → `ecrire_document(code, contenu_md,
resume_modif, statut: en_cours|en_revue)`. Chaque écriture crée une nouvelle version ; un document
validé ou signé repasse en revue. Refusé si le document est produit par un humain (scan signé, TDR).

**Réunion** → un seul `creer_compte_rendu(date, type, participants, contenu_md, decisions[], actions[],
risques[], changements[])` : tout est créé dans la même transaction (rien si une donnée est invalide).

**Retour client** → qualifier (bug | evolution | question | remarque ; haute | moyenne | basse),
`rechercher` la fonctionnalité concernée, `creer_retour(retour_md, …, fonctionnalites)`, puis
`maj_retour(ref, statut, action_md)` quand il est traité. Évolution hors périmètre → `proposer_changement`.

**Gestion** : `ajouter_risque` / `maj_risque` / `lister_risques`, `creer_jalon` / `maj_jalon` (date_reelle = jalon atteint), `ajouter_action` / `maj_action(statut: a_faire|en_cours|fait|annule)`,
`lister_changements`, `lire_reunion(date?)`, `lister_membres`.

**Nouveau projet** (admin ou chef de projet) : `creer_projet(code, nom, client, description, date_debut,
date_livraison_prevue, depots: [{nom, url, stack}])` → puis `creer_fonctionnalite(titre, lot, poids,
origine: interne, depots[], exigences?, description)` pour chaque fonctionnalité (la description porte les critères d'acceptation) ; `creer_jalon` pour le planning ; la référence F-xxx est attribuée
par le serveur (lis-la dans la réponse).

## Prompts MCP disponibles

`init-projet`, `document`, `compte-rendu`, `recette`, `retour-client`, `avancement`, `fin-session`
(arguments `projet`, `demande`) — dans Claude Code : `/mcp__pilotage__recette`, etc.

Voir [reference.md](reference.md) pour la liste complète des outils et de leurs paramètres,
et les erreurs courantes.
