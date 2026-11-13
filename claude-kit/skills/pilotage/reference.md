# Référence des outils MCP « pilotage »

`*` = obligatoire. Tous les outils (sauf `lister_projets`, `lire_modele_document`, `creer_projet`,
`ajouter_note_session`, `cloturer_session`) prennent `projet*` (code). Les écritures acceptent
`session_id` (uuid) — passe-le toujours.

## Lecture
| Outil | Paramètres | Usage |
|---|---|---|
| `lister_projets` | — | projets accessibles + avancement |
| `etat_projet` | depot | indicateurs, en cours, prochain jalon, alertes — **début de session** |
| `lire_tdr` / `lister_exigences` | — | cadrage, exigences E-xxx |
| `lister_fonctionnalites` | statut, depot, lot, page | liste paginée (50) |
| `lire_fonctionnalite` | ref* | exigences, statuts par dépôt, tests, retours, commits |
| `lister_documents` | phase, statut, page | suivi des livrables |
| `lire_document` | code*, version | contenu Markdown |
| `lire_modele_document` | code* | modèle + consignes de rédaction |
| `lister_cas_test` | fonctionnalite | cahier de recette |
| `lire_campagne` | ref* | résultats d'une campagne |
| `lister_retours` | statut, page | retours clients |
| `lister_risques` · `lister_actions` · `lister_changements` · `lister_jalons` | — | registres |
| `lire_reunion` | date | compte rendu |
| `lire_doc_technique` | depot, chemin | documentation technique |
| `rechercher` | texte* | plein texte sur tout le projet |
| `tracabilite` | — | exigence → fonctionnalités → tests → retours ; exigences non couvertes |
| `lister_membres` | — | équipe du projet et rôles |

## Écriture
| Outil | Paramètres |
|---|---|
| `demarrer_session` | depot, session_externe → `session_id` |
| `ajouter_note_session` | session_id*, texte*, fonctionnalites[] |
| `cloturer_session` | session_id*, resume_md* |
| `maj_statut_fonctionnalite` | ref*, statut*, depot, notes |
| `creer_fonctionnalite` | titre*, lot, poids (1/2/3/5/8), origine (interne \| DC-xxx), depots[], exigences[], description |
| `maj_fonctionnalite` | ref*, titre, lot, poids, description (critères d'acceptation), depots[] |
| `creer_jalon` / `maj_jalon` | nom*, date_prevue, lot, facturation, documents[] / ref*, date_prevue, date_reelle, nom, lot |
| `maj_risque` | ref*, statut (ouvert\|surveille\|survenu\|clos), probabilite, impact, parade, responsable |
| `generer_document` | code* (DAT, SFD, PLANNING, CAHIER-RECETTE, PV-RECETTE, RAPPORTS, registres…), statut — génère depuis les données du projet |
| `ecrire_document` | code*, contenu_md*, resume_modif*, statut (en_cours \| en_revue) |
| `maj_statut_document` | code*, statut* (a_produire, en_cours, en_revue — pas valide/signe) |
| `ecrire_doc_technique` | depot, chemin*, contenu_md* |
| `ajouter_adr` | titre*, contexte*, decision*, consequences, alternatives, depots[], fonctionnalites[] |
| `ajouter_entree_changelog` | type* (ajoute\|modifie\|corrige\|retire), texte*, fonctionnalite, version |
| `creer_cas_test` | titre*, fonctionnalite, preconditions, etapes[], attendu |
| `enregistrer_resultats` | campagne*, titre, date, environnement, resultats*[{cas_test, resultat, commentaire}] |
| `creer_retour` | retour_md*, type, priorite, source, contact_client, date, fonctionnalites[] |
| `maj_retour` | ref*, statut* (nouveau\|en_cours\|resolu\|rejete), action_md |
| `ajouter_risque` | titre*, probabilite* (1-4), impact* (1-4), categorie, parade, responsable |
| `ajouter_action` / `maj_action` | action*, responsable, echeance / ref*, statut* |
| `proposer_changement` | titre*, description, demandeur, impact_delai_jours, impact_cout, fonctionnalites[] |
| `creer_compte_rendu` | date*, contenu_md*, type, titre, lieu, participants[], decisions[], actions[], risques[], changements[] |
| `ecrire_tdr` / `creer_exigence` | contenu_md* / titre*, priorite, section_tdr, description — chef de projet ; agent seulement pendant une révision de périmètre |
| `ajouter_partie_prenante` | nom*, fonction, organisme, role, influence, attentes |
| `creer_projet` | code*, nom*, client, description, date_debut, date_livraison_prevue, depots[{nom, url, stack}] |

## Erreurs courantes
- **« Introuvable : projet … »** : code erroné ou projet hors du périmètre du jeton → `lister_projets`.
- **« Refusé : l'agent ne peut … »** : limite volontaire ; transmettre à un humain, ne pas réessayer.
- **« recette » refusé** : un cas de test n'est pas OK → `lire_fonctionnalite` pour voir lesquels.
- **401** : jeton expiré ou révoqué → l'utilisateur en recrée un (Paramètres → Assistants IA).
- **Invalide : date / poids / probabilité** : corriger le format (AAAA-MM-JJ, 1/2/3/5/8, 1-4).
