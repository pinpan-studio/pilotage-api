# Prompt de développement — Application « Pilotage » (version avec backend)

> **Mode d'emploi.** Ce document est un cahier des charges rédigé pour être donné tel quel à
> un agent de développement (Claude Code). Le projet est réparti sur **deux dépôts séparés** :
> `pilotage-api` (backend) et `pilotage-web` (frontend) — voir §3.3. Place ce document dans
> `docs/` **des deux dépôts**, et le kit actuel décompressé dans `reference/kit-v1/` du dépôt
> `pilotage-api`. Commence par le backend :
> *« Lis docs/PROMPT-APPLICATION.md et reference/kit-v1/. Tu travailles sur le dépôt
> pilotage-api. Propose le plan de la phase 1 backend, puis développe-le. »*
> Puis, dans `pilotage-web` : *« Lis docs/PROMPT-APPLICATION.md. Tu travailles sur le dépôt
> pilotage-web. Le contrat d'API est dans openapi/openapi.json. Propose le plan, puis développe. »*
>
> Le kit v1 (fichiers YAML/Markdown + tableau de bord statique) est **fonctionnel et testé**.
> Il sert de spécification exécutable : modèle de données, règles de calcul, alertes, modèles
> de documents et instructions de l'agent documentaliste sont à **reprendre**, pas à réinventer.

---

## 1. Contexte et objectif

**Porteur :** responsable digital d'une société de services numériques à Abidjan
(Côte d'Ivoire). Petite équipe de développeurs, clients institutionnels (administrations,
secteur pétrolier). Les projets sont développés avec l'aide d'agents IA (Claude Code).

**Problème :** suivre en un seul endroit tout le cycle d'un projet de développement :
TDR / cahier des charges → exigences → fonctionnalités → code → documentation technique
→ recette → livraison → retours clients → clôture, ainsi que **toute la documentation de
gestion de projet** (note de cadrage, SFD, PV, manuels…). Une grande partie de cette
documentation doit être **rédigée automatiquement par l'agent IA au fur et à mesure du
développement**.

**Objectif de la v2 :** remplacer le stockage par fichiers par une **application web avec
backend et base de données**, à laquelle :
1. **Claude se connecte via un serveur MCP** pour lire l'état du projet (TDR, fonctionnalités,
   documents à produire, retours…) et **y écrire** ses notes de session, statuts, documents,
   risques, résultats de recette.
2. Les **hooks Claude Code** envoient automatiquement le journal des actions (modifications,
   commandes, commits) à l'API.
3. L'équipe (et plus tard le client) consulte et saisit dans une **interface web** :
   tableau de bord multi-projets, retours clients, validation des documents, recette.

**Contraintes du terrain :**
- **Connexion internet instable** : rien ne doit bloquer le développement quand le réseau
  tombe ; les hooks mettent en file d'attente locale et renvoient plus tard.
- Interface et contenus **en français**. Dates au format français, fuseau Africa/Abidjan (UTC+0).
- Données clients confidentielles (TDR d'administrations) : sécurité et cloisonnement par projet.
- Petite équipe : exploitation simple, peu de composants.

---

## 2. Ce qui existe : le kit v1 (dans `reference/kit-v1/`)

| Élément du kit v1 | Fichier(s) | À reprendre en v2 comme… |
|---|---|---|
| Modèle de projet | `projets/_modele/**` | schéma de la base (§5) |
| Projet d'exemple complet (fictif) | `projets/exemple-declarations/**` | **données de démonstration (seed)** et cas de test |
| Calcul de l'avancement, couverture, recette, alertes | `scripts/lib/pilotage.mjs` (`calculer`, `statutEffectif`, `avancementFonctionnalite`, `verifier`) | service `IndicateursService` — **porter la logique à l'identique**, avec tests unitaires sur le projet d'exemple |
| Catalogue des 40 documents de gestion de projet | `modeles/documents/catalogue.yaml` | table de référence `type_document` (seed) |
| Modèles de documents (SFD, DAT, PV, manuels…) | `modeles/documents/*.md` | table `modele_document` (seed), utilisés par l'agent via MCP |
| Modèles retour client, ADR, session, campagne | `modeles/*.md|yaml` | idem |
| Sous-agent documentaliste | `kit-claude/agents/documentaliste.md` | à adapter : mêmes règles, mais **outils MCP** au lieu de fichiers |
| Commandes slash | `kit-claude/commands/*.md` | à adapter pour appeler les outils MCP |
| Hooks (journal, rappel de doc, contexte de début de session) | `kit-claude/hooks/*.mjs` | à adapter : envoi HTTP + file d'attente hors ligne |
| Installeur dans un dépôt de code | `scripts/installer.mjs` | à adapter (écrit la config MCP + jeton) |
| Tableau de bord statique | `scripts/build.mjs`, `dashboard/style.css` | **référence fonctionnelle et visuelle** des écrans (§9) |
| Protection Basic Auth | `middleware.js` | remplacée par une vraie authentification |

Le README du kit (`reference/kit-v1/README.md`) décrit le fonctionnement complet : à lire en premier.

---

## 3. Architecture cible

```
┌──────────────────────┐  MCP (Streamable HTTP)  ┌──────────────────────────────────┐
│ Claude Code          │ ──────────────────────► │  Backend NestJS                  │
│ (poste développeur)  │                         │  ├─ /mcp        serveur MCP      │     ┌────────────┐
│  hooks ──────────────┼── POST /api/journal ──► │  ├─ /api/*      API REST         │ ──► │ PostgreSQL │
│  (file d'attente     │   (lots, idempotents)   │  ├─ Auth (JWT + jetons d'API)    │     └────────────┘
│   locale hors ligne) │                         │  ├─ IndicateursService (alertes) │     ┌────────────┐
└──────────────────────┘                         │  └─ Export DOCX/PDF (pandoc)     │ ──► │ Stockage   │
┌──────────────────────┐   REST + JWT            └──────────────────────────────────┘     │ objet (S3) │
│ Interface web Angular│ ◄──────────────────────────────────┘                             └────────────┘
└──────────────────────┘
```

### 3.1 Stack (par défaut — modifiable)
- **Backend :** NestJS (TypeScript), TypeORM, PostgreSQL 16, validation `class-validator`.
- **Serveur MCP :** SDK officiel `@modelcontextprotocol/sdk`, transport **Streamable HTTP**,
  monté dans NestJS sur `/mcp`.
- **Frontend :** Angular (standalone components, signals), design sobre repris de
  `dashboard/style.css` (variables CSS, mode sombre).
- **Fichiers :** **Vercel Blob** (décision retenue). Accès privé, via `@vercel/blob`
  (`BLOB_READ_WRITE_TOKEN`) derrière une interface `StockageService` ; téléversement depuis le
  navigateur par *client upload* (jeton émis par l'API après contrôle des droits). En développement
  hors ligne, un adaptateur disque local remplace Vercel Blob.
- **Exports :** Markdown → DOCX/PDF via `pandoc` (conteneur), en-tête avec logo du client.
- **Déploiement :** Docker Compose (api + web + postgres ; fichiers sur Vercel Blob) pour un VPS ;
  variante managée possible (Neon/Supabase + Railway/Render).
- **Dépôts séparés :** backend et frontend sont deux dépôts, déployés indépendamment (§3.3).

### 3.3 Répartition en deux dépôts

| Dépôt | Contenu | Déploiement |
|---|---|---|
| **`pilotage-api`** (privé) | NestJS : API REST, serveur MCP `/mcp`, endpoint journal, authentification, indicateurs et alertes, exports, migrations et seed ; dossier `claude-kit/` (hooks, agent documentaliste, commandes, installeur — versionné avec l'API qu'il appelle) ; `reference/kit-v1/` ; `openapi/openapi.json` (généré, commité) | Conteneur Docker (VPS ou Railway/Render) + PostgreSQL + stockage objet |
| **`pilotage-web`** (privé) | Angular : toutes les pages du §9 ; client HTTP **généré** depuis `openapi.json` (ex. `ng-openapi-gen`) | Site statique (Vercel, Netlify ou Nginx) |

**Contrat entre les deux :**
- La source de vérité du contrat est le **document OpenAPI** produit par `pilotage-api`
  (décorateurs `@nestjs/swagger`). Il est régénéré à chaque modification de l'API
  (`npm run openapi`), commité dans `openapi/openapi.json` et publié sur `GET /api/v1/openapi.json`.
- `pilotage-web` copie ce fichier dans `src/api/openapi.json` (script `npm run api:sync`
  qui le télécharge depuis l'API de développement ou de recette) et génère le client typé.
  Aucun type métier n'est écrit à la main côté frontend.
- Les énumérations (statuts, libellés français) et **tous les calculs d'indicateurs et
  d'alertes sont faits par l'API** ; le frontend affiche, il ne recalcule rien. L'API expose
  aussi `GET /api/v1/referentiels` (statuts, libellés, couleurs, poids) pour l'affichage.
- Versionnement : API préfixée `/api/v1` ; tout changement incompatible → `/api/v2`.
  Le frontend affiche un avertissement si la version de l'API ne correspond pas.
- CORS : l'API n'autorise que l'origine du frontend (variable `WEB_ORIGIN`).
- Authentification de l'interface : JWT d'accès court (15 min) + jeton de rafraîchissement
  en cookie `HttpOnly`, `Secure`, `SameSite=Strict` (sous-domaines `api.` et `app.` du même
  domaine), ou en-tête `Authorization` si les domaines diffèrent.

### 3.2 Multi-organisation
Prévoir dès le départ `organisation_id` sur les données (une organisation = une société
prestataire). Une seule organisation au début, mais le modèle permet d'en faire un produit.

---

## 4. Rôles et droits

| Rôle | Portée | Droits principaux |
|---|---|---|
| `admin` | organisation | tout, gestion des utilisateurs et des jetons |
| `chef_projet` | projets assignés | tout sur ses projets, **seul à valider / signer** documents et fonctionnalités (`valide`, `signe`) |
| `developpeur` | projets assignés | lecture, saisie retours/recette/CR/registres, statuts de dev |
| `agent` | jeton d'API lié à un développeur + projets | via MCP et journal uniquement ; **restrictions dures ci-dessous** |
| `client_lecteur` (phase 3) | un projet | lecture du tableau de bord client, saisie de retours |

**Restrictions dures du rôle `agent` (appliquées par l'API, pas par le prompt) :**
- ne peut **jamais** mettre une fonctionnalité à `valide`, ni un document à `valide` ou `signe` ;
- ne peut passer une fonctionnalité à `recette` que si tous ses tests sont `ok` dans la
  dernière campagne (vérifié côté serveur) ;
- ne peut pas modifier le TDR ni les exigences (sauf si un humain a ouvert une
  « révision du périmètre ») ;
- ne peut pas supprimer quoi que ce soit (suppression logique réservée aux humains) ;
- ne peut pas décider d'une demande de changement (`decision` reste `en_analyse`) ;
- toute écriture de l'agent est tracée (`auteur_type = agent`, utilisateur, session).

Authentification : JWT (interface web) ; **jetons d'API** hachés en base (préfixe visible,
portée = projets + rôle `agent`, expiration, révocation) pour MCP et hooks.

---

## 5. Modèle de données

Reprendre les champs du kit v1. Toutes les tables ont `id` (uuid), `organisation_id`,
`cree_le`, `modifie_le`, `cree_par`, `supprime_le` (suppression logique). Les identifiants
métier lisibles (`F-001`, `EX-01`…) sont uniques **par projet** et générés par le serveur.

| Table | Champs clés | Source v1 |
|---|---|---|
| `projet` | code, nom, client, chef_projet_id, description, date_debut, date_livraison_prevue, statut (`en_cours|en_pause|livre|cloture`), seuil_rappel_doc | `projet.yaml` |
| `membre_projet` | projet_id, utilisateur_id, role | — |
| `depot` | projet_id, nom, url, stack, role | `depots.yaml` |
| `exigence` | ref `EX-xx`, titre, section_tdr, priorite (`must|should|could`), description | `00-cadrage/exigences.yaml` |
| `fonctionnalite` | ref `F-xxx`, titre, jalon(lot), poids (1,2,3,5,8), statut, origine (`TDR|RC-xxx|DC-xxx|interne`), notes | `01-fonctionnalites.yaml` |
| `fonctionnalite_exigence` | n–n | `exigences: [...]` |
| `fonctionnalite_depot` | fonctionnalite_id, depot_id, statut (`a_faire|en_cours|bloque|developpe`) | `depots: {...}` |
| `cas_test` | ref `RT-xxx`, fonctionnalite_id, titre, preconditions, etapes (jsonb), attendu | `04-recette/tests.yaml` |
| `campagne` | ref `R1`, titre, date, type (`interne|client`), environnement, testeurs | `04-recette/campagnes/*.yaml` |
| `resultat_test` | campagne_id, cas_test_id, resultat (`ok|ko|reserve|non_teste`), commentaire | idem |
| `retour_client` | ref `RC-xxx`, date, source, contact_client, saisi_par, type, priorite, statut, date_resolution, retour (md), analyse (md), action (md) | `05-retours-client/*.md` |
| `retour_fonctionnalite` | n–n | |
| `type_document` | code, titre, phase, producteur (`agent|mixte|humain`), livrable, signature, recurrent, modele_id, description | `modeles/documents/catalogue.yaml` |
| `modele_document` | code, contenu (md) | `modeles/documents/*.md` |
| `document` | projet_id, type_document_id (ou titre+phase libres), statut (`a_produire|en_cours|en_revue|valide|signe|sans_objet`), echeance, responsable_id, lien_externe, notes | `documents.yaml` |
| `version_document` | document_id, numero (0.1…), contenu (md), resume_modif, auteur_type (`humain|agent`), auteur_id, session_id, cree_le | `08-livrables/*.md` |
| `fichier` | projet_id, document_id?, nom, type_mime, taille, cle_stockage, categorie (`tdr|scan_signe|annexe|export`) | `08-livrables/signes/` |
| `doc_technique` | projet_id, depot_id?, chemin, titre, contenu (md) | `02-technique/**` |
| `adr` | ref `ADR-xxx`, date, statut, contexte, decision, consequences, alternatives | `02-technique/decisions/` |
| `jalon` | ref `J1`, nom, date_prevue, date_reelle, lot, facturation | `07-gestion/planning.yaml` |
| `jalon_document` | n–n jalon ↔ type de document attendu | `livrables: [...]` |
| `risque` | ref `R-xxx`, titre, categorie, probabilite 1-4, impact 1-4, parade, responsable, statut (`ouvert|surveille|survenu|clos`) | `risques.yaml` |
| `action` | ref `A-xxx`, action, responsable, echeance, statut (`a_faire|en_cours|fait|annule`), origine (type + id) | `actions.yaml` |
| `changement` | ref `DC-xxx`, titre, demandeur, date, description, origine, impact_delai_jours, impact_cout, decision (`en_analyse|accepte|refuse|reporte`), date_decision, avenant | `changements.yaml` |
| `changement_fonctionnalite` | n–n | |
| `reunion` | date, type (`lancement|copil|comite-technique|atelier|recette|point-hebdo|autre`), lieu, participants (jsonb), redacteur, contenu (md) | `07-gestion/reunions/*.md` |
| `partie_prenante` | nom, fonction, organisme, role, influence, attentes | `parties-prenantes.yaml` |
| `session_dev` | projet_id, depot_id, utilisateur_id, debut, fin, resume (md), fonctionnalites[] | `03-journal/sessions/*.md` |
| `evenement_journal` | projet_id, depot_id, utilisateur_id, session_externe, ts, evt (`modification|creation|commande|commit|doc|agent`), outil, fichier, commande, hash, message, fonctionnalites[], **cle_idempotence (unique)** | `03-journal/actions/*.jsonl` |
| `changelog_entree` | version, date, type (`ajoute|modifie|corrige|retire`), texte, fonctionnalite_id | `CHANGELOG.md` |
| `rapport` | date, periode, contenu (md) | `06-rapports/` |
| `historique` | entite, entite_id, champ, ancienne_valeur, nouvelle_valeur, auteur_type, auteur_id, ts | (nouveau : audit de toutes les modifications) |

Index utiles : `evenement_journal(projet_id, ts)`, refs uniques par projet, `document(projet_id, statut)`.

---

## 6. Règles métier (reprendre `scripts/lib/pilotage.mjs` à l'identique)

**Avancement d'une fonctionnalité** — poids des statuts : `a_faire 0`, `en_cours 0.3`,
`bloque 0.3`, `developpe 0.7`, `recette 0.9`, `valide 1`. Si le statut global est
`recette` ou `valide` → ce poids ; sinon, si des statuts par dépôt existent → moyenne des
poids des dépôts ; sinon poids du statut global. `abandonne` exclu.

**Statut effectif** (affiché) : `recette|valide|abandonne` tels quels ; sinon dérivé des
dépôts : un `bloque` → `bloque` ; tous `developpe` → `developpe` ; tous `a_faire` →
`a_faire` ; sinon `en_cours`.

**Indicateurs projet :** avancement global et par lot (moyenne pondérée par `poids`),
développement par dépôt, couverture du TDR (exigences liées à ≥ 1 fonctionnalité active),
recette (résultat d'un test = dernière campagne l'ayant exécuté ; `non_teste` ne remplace
pas un résultat antérieur), retours ouverts, délai moyen de résolution, activité par jour,
avancement des livrables documentaires (poids : `a_produire 0`, `en_cours 0.4`,
`en_revue 0.7`, `valide|signe 1`, sur les documents `livrable` non récurrents, hors
`sans_objet`), statut des jalons (`atteint` si date réelle, `en_retard` si date prévue
dépassée, sinon `a_venir`), criticité des risques = probabilité × impact.

**Alertes** (niveaux haute / moyenne / basse) : fonctionnalité bloquée ; fonctionnalité
recettée/validée avec un test KO ; fonctionnalité développée sans cas de test ; en cours
sans activité depuis 14 j ; retour priorité haute ouvert depuis > 7 j ; exigence `must`
non couverte ; livraison dépassée ou ≤ 14 j avec avancement < 80 % ; document en retard
(échéance propre ou date du jalon qui l'attend) ; document signé sans scan ; PV de recette
à produire après une campagne client ; jalon en retard ; risque critique (≥ 9) ou survenu ;
actions en retard ; changement en analyse depuis > 14 j ; données incohérentes.

**Cohérence** (porter `verifier()`) : références existantes, statuts valides, refs uniques.
En v2 la plupart deviennent des contraintes de base ou de validation d'API.

**Cycle de vie d'un document :** `a_produire → en_cours → en_revue → valide → signe`
(ou `sans_objet`). Une version validée/signée est **figée** : toute modification crée une
nouvelle version qui repasse `en_revue`. Le passage à `signe` exige un scan téléversé
(catégorie `scan_signe`).

**Création d'un projet :** instancier un `document` par `type_document` du catalogue
(`a_produire`), comme `documentsInitiaux()` du kit.

---

## 7. Serveur MCP (`/mcp`)

Transport Streamable HTTP, authentification `Authorization: Bearer <jeton d'API>`. Le jeton
détermine l'utilisateur, le rôle `agent` et les projets autorisés. Chaque outil prend
`projet` (code) en paramètre, sauf `lister_projets`. Réponses concises, en français,
**lisibles par un LLM** (Markdown court + données structurées), paginées au-delà de 50 éléments.
Erreurs explicites (ex. « Refusé : seul un chef de projet peut valider un document »).

**Lecture**

| Outil | Rôle |
|---|---|
| `lister_projets` | projets accessibles avec avancement |
| `etat_projet(projet, depot?)` | équivalent de `scripts/etat.mjs` : indicateurs, fonctionnalités en cours, prochain jalon, documents en cours, actions ouvertes, retours ouverts, alertes. **Appelé en début de session.** |
| `lire_tdr(projet)` · `lister_exigences(projet)` | cadrage |
| `lister_fonctionnalites(projet, statut?, depot?, lot?)` · `lire_fonctionnalite(projet, ref)` | avec exigences, tests, retours, dernière activité |
| `lister_documents(projet, phase?, statut?)` · `lire_document(projet, code, version?)` | suivi documentaire et contenu |
| `lire_modele_document(code)` | modèle Markdown + consignes |
| `lister_cas_test(projet, fonctionnalite?)` · `lire_campagne(projet, ref)` | recette |
| `lister_retours(projet, statut?)` · `lister_risques` · `lister_actions` · `lister_changements` · `lister_jalons` · `lire_reunion` | registres |
| `lire_doc_technique(projet, depot?, chemin?)` | documentation technique |
| `rechercher(projet, texte)` | recherche plein texte (PostgreSQL `tsvector`, config `french`) |

**Écriture**

| Outil | Règles |
|---|---|
| `demarrer_session(projet, depot)` → `session_id` | appelé par le hook de début de session |
| `ajouter_note_session(session_id, texte, fonctionnalites?)` | notes au fil de l'eau |
| `cloturer_session(session_id, resume_md)` | résumé (modèle `modeles/session.md`) |
| `maj_statut_fonctionnalite(projet, ref, depot?, statut, notes?)` | interdit `valide` ; `recette` seulement si tests tous OK |
| `creer_fonctionnalite(projet, titre, exigences[], lot, poids, origine)` | origine `interne` ou `DC-xxx` ; ref attribuée par le serveur |
| `ecrire_doc_technique(projet, depot, chemin, contenu_md)` | crée / met à jour (historisé) |
| `ecrire_document(projet, code, contenu_md, resume_modif)` | crée une **nouvelle version** ; statut → `en_cours` ou `en_revue` (jamais au-delà) ; refusé si producteur `humain` |
| `ajouter_adr` · `ajouter_entree_changelog` | |
| `creer_cas_test(projet, fonctionnalite, …)` · `enregistrer_resultats(projet, campagne, resultats[])` | |
| `creer_retour(projet, …)` · `maj_retour(projet, ref, statut, action_md)` | |
| `ajouter_risque` · `ajouter_action` · `maj_action` · `proposer_changement` (decision forcée `en_analyse`) | |
| `creer_compte_rendu(projet, type, date, participants, contenu_md, actions[], decisions[], risques[])` | crée la réunion **et** alimente actions/risques/changements de façon transactionnelle |

Exposer aussi en **prompts MCP** les commandes du kit (`init-projet`, `document`,
`compte-rendu`, `recette`, `retour-client`, `avancement`, `fin-session`), adaptées aux outils.

---

## 8. API REST et intégration Claude Code

**API REST** (`/api/v1`, OpenAPI généré) : CRUD de toutes les entités du §5 selon les droits
du §4, endpoints d'indicateurs (`GET /projets/:code/indicateurs`, `/alertes`), exports
(`GET /projets/:code/documents/:code/export?format=docx|pdf`), téléversement de fichiers
(jetons de *client upload* Vercel Blob), import (`POST /import/kit-v1` : archive d'un dossier `projets/<code>`).

**Journal (hooks)** : `POST /api/v1/journal` accepte un **lot** d'événements ; chaque
événement porte une `cle_idempotence` (uuid généré côté poste) pour que les renvois après
coupure ne créent pas de doublons. Réponse 202 rapide.

**Kit Claude Code v2** (dossier `claude-kit/` du dépôt `pilotage-api`, à dériver de `kit-claude/` du v1) :
- `installer` : écrit dans le dépôt de code `.claude/settings.json` (hooks),
  `.claude/agents/documentaliste.md`, `.claude/commands/*`, le bloc `CLAUDE.md`, et la
  config MCP du projet (`.mcp.json` avec l'URL ; **le jeton est lu depuis une variable
  d'environnement** `PILOTAGE_TOKEN`, jamais écrit dans un fichier versionné) ;
- hook `PostToolUse` : construit l'événement (même logique que `journal.mjs`, masquage des
  secrets compris), l'ajoute à une **file locale** (`~/.pilotage/file-attente.jsonl`) puis
  tente un envoi groupé avec un délai court (≤ 2 s) ; en cas d'échec, sortie silencieuse ;
  la file est vidée au prochain appel réussi ;
- hook `SessionStart` : appelle `demarrer_session` + `etat_projet` et injecte le résumé
  dans le contexte ; hors ligne → dernier état mis en cache localement ;
- hook `Stop` : même logique de rappel que `fin-tour.mjs` (compteur de modifications de
  code / commit sans mise à jour de doc → `decision: block` une fois).

---

## 9. Interface web (Angular)

Reprendre les écrans du tableau de bord v1 (voir `scripts/build.mjs` et les captures du
projet d'exemple) et les rendre **interactifs** :

1. **Portefeuille** : cartes projets (avancement, couverture, recette, livrables, retours,
   actions en retard, prochain jalon, alertes).
2. **Projet — Synthèse** : tuiles, alertes, répartition des statuts, avancement par lot et par
   dépôt, activité 30 j, dernières sessions.
3. **Fonctionnalités** : tableau filtrable, édition du statut par dépôt, fiche détaillée
   (exigences, tests, retours, journal lié, commits).
4. **Traçabilité** : exigence → fonctionnalités → tests → retours.
5. **Recette** : campagnes, saisie des résultats en grille, cahier de recette, génération du PV.
6. **Retours clients** : liste, formulaire de saisie, rattachement, suivi.
7. **Gestion** : planning (Gantt simple), matrice et registre des risques, plan d'actions,
   changements (avec circuit de décision), comptes rendus, parties prenantes.
8. **Livrables** : documents par phase ; fiche document avec éditeur Markdown + aperçu,
   historique des versions et **comparaison (diff)**, circuit `en_revue → valide → signe`
   (boutons réservés au chef de projet), téléversement du scan, export DOCX/PDF.
9. **Journal** : sessions (résumés + notes), flux des événements filtrable (dépôt, auteur, type).
10. **Administration** : utilisateurs, membres par projet, **jetons d'API** (création avec
    affichage unique, révocation), catalogue de documents et modèles.

Toutes les écritures de l'agent sont visibles avec un badge « Agent » et le nom du
développeur dont le jeton a été utilisé.

---

## 10. Exigences non fonctionnelles

- **Sécurité :** HTTPS, mots de passe hachés (argon2), jetons d'API hachés, cloisonnement
  strict par organisation et projet (tests dédiés), limitation de débit sur `/mcp` et
  `/journal`, en-têtes de sécurité, journal d'audit (`historique`), aucun secret dans les logs.
- **Hors ligne :** hooks non bloquants (timeout court, file locale) ; l'interface affiche
  clairement l'heure de dernière synchronisation par dépôt.
- **Performance :** tableau de bord < 1 s pour un projet de 500 fonctionnalités et
  200 000 événements de journal (agrégats précalculés ou vues matérialisées si besoin).
- **Sauvegardes :** dump PostgreSQL quotidien + copie quotidienne des blobs Vercel ; procédure de
  restauration documentée.
- **Qualité :** tests unitaires des indicateurs (résultats identiques au kit v1 sur
  `exemple-declarations`), tests e2e API, tests du serveur MCP (client MCP de test).
- **Langue :** interface, messages d'erreur, contenus générés en français.

---

## 11. Phases et critères d'acceptation

### Phase 1 — Socle (priorité)
**Dépôt `pilotage-api` d'abord**, puis `pilotage-web` une fois le contrat OpenAPI stabilisé.
- `pilotage-api` : Docker Compose de développement (api + postgres ; stockage local ou Vercel Blob), migrations,
  seed du catalogue + modèles de documents, génération d'`openapi.json`.
- `pilotage-web` : squelette Angular, connexion, client généré, pages en lecture.
- Auth (JWT) + jetons d'API + rôles et restrictions de l'agent.
- **Import du kit v1** : `projets/exemple-declarations` importé intégralement.
- `IndicateursService` porté depuis `pilotage.mjs` ; **critère : mêmes valeurs que
  `node scripts/etat.mjs exemple-declarations --json` du kit v1** (avancement 43 %,
  couverture 100 %, recette OK 67 %, 2 retours ouverts…) à date de calcul égale.
- Serveur MCP avec les outils de lecture + `demarrer_session`, `ajouter_note_session`,
  `cloturer_session`, `maj_statut_fonctionnalite`, `ecrire_document`, `ecrire_doc_technique`,
  `creer_retour`, `ajouter_risque`, `ajouter_action`.
  **Critère :** depuis Claude Code, `claude mcp add …` puis « donne-moi l'état du projet »
  et « ajoute une note de session » fonctionnent ; la tentative de passer un document en
  `signe` est refusée par l'API.
- Endpoint journal idempotent + kit Claude Code v2 (hooks avec file hors ligne).
  **Critère :** couper le réseau, faire 10 modifications, rétablir : 10 événements en base,
  aucun doublon.
- Interface en lecture : portefeuille, synthèse, fonctionnalités, livrables, journal.

### Phase 2 — Gestion
- Saisie complète dans l'interface (retours, recette, registres, CR, statuts).
- Documents : éditeur, versions, diff, circuit de validation, scans, exports DOCX/PDF.
- Outils MCP restants + prompts MCP.

### Phase 3 — Portail client et notifications
- Rôle `client_lecteur` : tableau de bord simplifié, saisie de retours.
- Notifications (e-mail, WhatsApp Business) : retour créé, document en revue, jalon proche.
- OAuth sur `/mcp` pour l'utiliser aussi comme connecteur dans l'application Claude.

---

## 12. Consignes pour l'agent de développement

1. Lis d'abord `reference/kit-v1/README.md`, puis `scripts/lib/pilotage.mjs`, le catalogue
   et le projet d'exemple. Ne réinvente pas les règles : porte-les.
2. Propose le plan détaillé de la phase 1 (schéma, modules NestJS, liste des outils MCP,
   arborescence) et **attends la validation** avant de coder.
3. Développe par petites étapes vérifiables, avec tests. Travaille dans **un seul dépôt à la
   fois** : ne modifie pas l'autre. Dans `pilotage-api`, commits préfixés par la zone
   (`api:`, `mcp:`, `kit:`, `db:`) ; dans `pilotage-web`, par l'écran ou le module.
   Toute évolution de l'API régénère `openapi/openapi.json` dans le même commit.
4. Garde le français pour l'interface, les messages et les noms métier (les noms de tables
   et de champs peuvent rester en français comme dans le kit).
5. Ne mets jamais de secret dans le dépôt ; fournis un `.env.example`.
6. Pose les questions bloquantes (hébergement, nom de domaine, stockage) au lieu de supposer.

---

## 13. Décisions complémentaires

- **Stockage des fichiers : Vercel Blob** (remplace S3/MinIO partout dans ce document).
- **Branches :** `main` et `master` sont maintenues au même niveau (même commit) dans les deux dépôts.
