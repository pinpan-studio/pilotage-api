# Pilotage des projets de développement assistés par IA

Un kit pour suivre tes projets de développement, du **TDR / cahier des charges** jusqu'à la
**recette** et aux **retours clients**. Pendant que tu développes avec **Claude Code**, un
agent rédige et tient à jour la documentation. Un **tableau de bord** multi-projets est
déployable sur **Vercel**.

```
TDR ──► Exigences (EX) ──► Fonctionnalités (F) ──► Code (commits [F-xxx]) ──► Tests (RT) ──► Recette ──► Validation client
                                  ▲                                                                         │
                                  └──────────────────────── Retours clients (RC) ◄──────────────────────────┘
```

- **Tout est dans git**, sous forme de fichiers YAML et Markdown lisibles. La doc évolue avec le code.
- **Le journal des agents est automatique.** Des hooks Claude Code enregistrent chaque modification, commande et commit, sans dépendre de la bonne volonté de l'agent.
- **La documentation est rédigée par un sous-agent « documentaliste ».** Un hook le déclenche si l'agent oublie de mettre la doc à jour après un commit.
- **L'avancement est calculé, pas estimé.** Il est pondéré par la taille et le statut des fonctionnalités, par dépôt.
- **Tout le corpus documentaire d'un projet** : 40 documents référencés, de la note de cadrage au PV de réception définitive. Pour chacun : un modèle, un statut, une échéance liée aux jalons. L'agent rédige ceux qu'il peut produire à partir des données du projet.
- **Les registres de gestion** : planning et jalons (avec les tranches de paiement), risques, plan d'actions, demandes de changement, comptes rendus de réunion, parties prenantes.
- **Plusieurs dépôts par projet** (backend, web, mobile…) et **plusieurs projets** suivis sur un seul tableau de bord.

> **Données confidentielles.** Ce dépôt public contient uniquement le kit et un projet
> **fictif** d'exemple. Pour tes vrais projets, crée un **dépôt privé** à partir de ce
> modèle (bouton *Use this template* → *Private*). Un TDR, des retours clients ou un journal
> de développement n'ont rien à faire dans un dépôt public.

---

## Sommaire

1. [Organisation](#1-organisation)
2. [Mise en place](#2-mise-en-place)
3. [Utilisation au quotidien](#3-utilisation-au-quotidien)
4. [Le tableau de bord sur Vercel](#4-le-tableau-de-bord-sur-vercel)
5. [Formats des fichiers](#5-formats-des-fichiers)
6. [Calcul des indicateurs](#6-calcul-des-indicateurs)
7. [Travail en équipe](#7-travail-en-équipe)

---

## 1. Organisation

```
pilotage/                         ← ce dépôt (ta copie privée)
├── projets/
│   ├── _modele/                  ← modèle copié pour chaque nouveau projet
│   └── <code-projet>/
│       ├── projet.yaml           ← fiche projet (client, dates, équipe)
│       ├── depots.yaml           ← dépôts de code du projet
│       ├── 00-cadrage/
│       │   ├── tdr.md            ← TDR / cahier des charges (référence, jamais modifié par l'agent)
│       │   └── exigences.yaml    ← exigences extraites du TDR (EX-01…)
│       ├── 01-fonctionnalites.yaml  ← fonctionnalités, statut par dépôt (F-001…)
│       ├── 02-technique/
│       │   ├── architecture-globale.md
│       │   ├── <depot>/*.md      ← doc technique de chaque dépôt (API, données, installation…)
│       │   └── decisions/ADR-xxx.md
│       ├── 03-journal/
│       │   ├── actions/AAAA-MM/<depot>--<auteur>.jsonl   ← automatique (hooks)
│       │   └── sessions/*.md     ← résumés de session
│       ├── 04-recette/
│       │   ├── tests.yaml        ← cahier de recette (RT-001…)
│       │   └── campagnes/*.yaml  ← résultats de chaque campagne
│       ├── 05-retours-client/RC-xxx.md
│       ├── 06-rapports/          ← rapports d'avancement pour le client
│       ├── 07-gestion/           ← planning.yaml, risques.yaml, actions.yaml, changements.yaml,
│       │                            parties-prenantes.yaml, reunions/*.md (comptes rendus)
│       ├── 08-livrables/         ← documents rédigés (SFD, DAT, manuels, PV…) + signes/ (scans signés)
│       ├── documents.yaml        ← suivi de tous les documents du projet (statut, échéance, version)
│       └── CHANGELOG.md
├── kit-claude/                   ← hooks, sous-agent et commandes installés dans les dépôts de code
├── modeles/                      ← modèles de retour client, ADR, session, campagne
│   └── documents/                ← catalogue.yaml + modèles de tous les documents de gestion de projet
├── scripts/                      ← build du tableau de bord, installeur, état, vérification
├── dashboard/style.css
├── middleware.js                 ← protection par mot de passe sur Vercel
└── vercel.json
```

**Les dépôts de code restent séparés.** Le kit installe dans chacun un petit dossier
`.claude/` qui pointe vers ce dépôt de pilotage :

```
mes-projets/
├── pilotage/          ← ce dépôt
├── dgh-backend/       ← .claude/ installé par le kit
├── dgh-web/
└── dgh-mobile/
```

---

## 2. Mise en place

Prérequis : **Node.js 18 ou plus**, **git**, **Claude Code**.

### 2.1 Créer ton dépôt de pilotage privé

Sur GitHub : **Use this template → Create a new repository → Private**. Ensuite :

```bash
git clone https://github.com/<toi>/pilotage.git
cd pilotage
npm install
rm -rf projets/exemple-declarations        # supprimer le projet fictif
```

### 2.2 Créer un projet

```bash
npm run nouveau-projet -- dgh-declarations --nom "Portail des déclarations" --client "DGH"
```

### 2.3 Installer le kit dans chaque dépôt de code

```bash
node scripts/installer.mjs --projet dgh-declarations --depot backend --repo ../dgh-backend
node scripts/installer.mjs --projet dgh-declarations --depot web     --repo ../dgh-web
```

L'installeur :
- ajoute à `.claude/settings.json` les hooks qui journalisent, rappellent de documenter et injectent l'état du projet en début de session ;
- copie le sous-agent `documentaliste` et les commandes `/init-projet`, `/maj-doc`, `/document`, `/compte-rendu`, `/registre`, `/recette`, `/retour-client`, `/avancement`, `/fin-session` ;
- ajoute un bloc d'instructions dans `CLAUDE.md` ;
- donne à Claude Code l'accès au dossier de pilotage (`.claude/settings.local.json`) ;
- déclare le dépôt dans `depots.yaml`.

Commite ces fichiers dans le dépôt de code. `.claude/pilotage.local.json` et
`.claude/settings.local.json` sont propres à chaque poste et automatiquement ignorés par git.

> Relance l'installeur après une mise à jour du kit pour actualiser les commandes et l'agent.
> La logique des hooks est lue directement dans le dépôt de pilotage : un `git pull` suffit pour elle.

### 2.4 Initialiser le projet à partir du TDR

Ouvre Claude Code dans un des dépôts de code. Un message `[Pilotage]` apparaît au démarrage. Lance ensuite :

```
/init-projet ~/Documents/TDR-portail-declarations.pdf
```

L'agent convertit le TDR en Markdown, extrait les exigences, propose les fonctionnalités
(lots, poids, dépôts concernés) et rédige une première architecture. **Relis et valide**
la liste avant de commencer.

---

## 3. Utilisation au quotidien

| Moment | Ce qui se passe | Qui |
|---|---|---|
| Ouverture de Claude Code | L'état du projet (fonctionnalités en cours, retours ouverts, alertes) est injecté dans le contexte | hook automatique |
| Pendant le développement | Chaque modification, commande et commit est journalisé | hook automatique |
| Commit | Message préfixé : `[F-012] export PDF des déclarations` | agent ou toi |
| Après un commit ou ~8 modifications | Si la doc n'a pas été mise à jour, l'agent reçoit l'ordre de lancer le documentaliste | hook automatique |
| `/maj-doc` | Force la mise à jour de la doc | toi |
| `/recette` | Génère les cas de test des fonctionnalités développées | toi |
| `/recette campagne R2 …` | Enregistre les résultats d'une campagne (OK/KO/réserves) | toi |
| `/retour-client <texte du mail>` | Crée la fiche RC-xxx, classe, rattache aux fonctionnalités | toi ou l'équipe |
| `/avancement` / `/avancement rapport` | État du projet, ou rapport d'avancement rédigé pour le client | toi |
| `/fin-session` | Résumé de session, doc à jour, commit du pilotage (push sur confirmation) | toi |

Sans Claude Code, en ligne de commande :

```bash
npm run etat -- dgh-declarations       # résumé texte
npm run verifier                       # cohérence des fichiers (ids, références, statuts)
npm run dev                            # tableau de bord en local sur http://localhost:3000
```

**Garde-fous du documentaliste.** Il ne modifie jamais le TDR ni le journal automatique.
Il ne passe jamais une fonctionnalité en « validé client » : seul un humain le fait. Il ne la
passe en « recetté » que si tous ses tests sont OK dans la dernière campagne. Il n'écrit
aucun secret dans la doc.

---

## 3 bis. Les documents de gestion de projet

Le catalogue (`modeles/documents/catalogue.yaml`) référence les documents suivants. Chaque
projet en suit l'état dans `documents.yaml`. `/init-projet` l'ajuste aux livrables exigés
par le TDR : il marque `sans_objet` ce qui n'est pas requis et ajoute les livrables propres au projet.

| Phase | Documents |
|---|---|
| **Cadrage** | TDR, offre, contrat, note de cadrage, CR de lancement, plan d'assurance qualité, organisation / RACI, planning |
| **Conception** | spécifications fonctionnelles détaillées, dossier d'architecture technique, dictionnaire de données, maquettes, charte graphique, analyse sécurité et protection des données, PV de validation des spécifications |
| **Réalisation** | documentation technique par dépôt, journal des versions |
| **Recette** | plan de recette, cahier de recette, PV de recette, PV de levée des réserves |
| **Déploiement** | plan de mise en production, guide d'installation, manuel utilisateur, manuel d'administration, dossier d'exploitation, supports de formation, PV de formation, bordereau de livraison, PV de réception provisoire |
| **Clôture** | PV de réception définitive, transfert de compétences, rapport de fin de projet, retour d'expérience, plan de maintenance et garantie |
| **Pilotage** | comptes rendus de réunion / COPIL, rapports d'avancement, registres des risques, des changements, des actions et des parties prenantes |

Chaque document a un **mode de rédaction** :
- **agent** : rédigé par l'agent à partir du projet. Exemples : la SFD à partir des fonctionnalités, le guide d'installation à partir du code, le PV de recette à partir d'une campagne.
- **agent + humain** : brouillon de l'agent, complété et validé par l'équipe.
- **humain** : document externe (contrat, maquettes) référencé par un `fichier` ou un `lien`.

**Cycle de vie d'un document** : `a_produire` → `en_cours` → `en_revue` → `valide` → `signe`, ou `sans_objet`.
L'agent ne dépasse jamais `en_revue`. La validation et la signature sont faites par un humain.
Range le scan signé dans `08-livrables/signes/<CODE>-<date>.pdf` : le tableau de bord le
détecte. Pour un export Word destiné au client : `pandoc 08-livrables/sfd.md -o sfd.docx`.

| Commande | Rôle |
|---|---|
| `/document` | liste les documents à produire en priorité |
| `/document SFD lot 2` | rédige ou met à jour un document à partir de son modèle et des données du projet |
| `/document PV-RECETTE R2` | prépare le PV de la campagne R2, prêt à signer |
| `/compte-rendu copil <notes>` | rédige le CR de réunion et alimente les actions, risques, changements et jalons |
| `/registre risque <description>` | ajoute un risque (ou une action, un changement, un jalon, une partie prenante) |

`npm run documents -- <projet>` liste l'état des documents.
`npm run documents -- <projet> --synchroniser` ajoute à un projet existant les documents ajoutés au catalogue.

**Alertes liées** : document en retard sur son échéance ou son jalon, jalon dépassé, risque
critique (criticité ≥ 9/16) ou survenu, action en retard, demande de changement en analyse
depuis plus de 14 jours, PV de recette à produire après une recette client, document signé sans scan.

## 4. Le tableau de bord sur Vercel

1. Sur [vercel.com/new](https://vercel.com/new), importe ton dépôt **privé** de pilotage.
   Les réglages (build `npm run build`, sortie `dist`) sont lus depuis `vercel.json`.
2. Dans **Settings → Environment Variables**, ajoute :
   - `PILOTAGE_UTILISATEUR`, par exemple `equipe`
   - `PILOTAGE_MOT_DE_PASSE`, un mot de passe long
3. Déploie. Sans ces deux variables, l'accès est refusé par défaut.

Chaque `git push` sur le dépôt de pilotage redéploie le tableau de bord.

**Contenu du tableau de bord :**
- **Portefeuille** : tous les projets, avec l'avancement, la couverture du TDR, la recette, les retours ouverts et les alertes.
- **Synthèse projet** : indicateurs, alertes, répartition des statuts, avancement par lot et par dépôt, activité sur 30 jours, dernières sessions.
- **Fonctionnalités** : statut global et par dépôt, avancement, tests, dernière activité.
- **Traçabilité** : exigence du TDR → fonctionnalités → tests (dernier résultat) → retours.
- **Recette** : campagnes, cahier de recette avec les étapes et les résultats.
- **Retours clients** : fiches, statut, délai moyen de résolution.
- **Gestion** : planning et jalons, matrice et registre des risques, plan d'actions, demandes de changement, comptes rendus de réunion, parties prenantes.
- **Livrables** : avancement par phase de tous les documents, statuts, échéances, accès au document, liens externes, scans signés ; tous les documents Markdown sont rendus en HTML.
- **Journal** : sessions de travail et actions enregistrées automatiquement.
- `p/<projet>/etat.json` : les indicateurs en JSON, pour d'autres outils.

---

## 5. Formats des fichiers

Les modèles commentés se trouvent dans `projets/_modele/` et `modeles/`. Le projet
`projets/exemple-declarations/` donne un exemple complet.

**Fonctionnalité** (`01-fonctionnalites.yaml`)
```yaml
- id: F-004
  titre: "Dépôt des pièces justificatives"
  exigences: [EX-03]          # lien vers le TDR
  jalon: "Lot 1"
  poids: 3                    # 1, 2, 3, 5, 8
  statut: en_cours            # a_faire | en_cours | bloque | developpe | recette | valide | abandonne
  depots: { backend: developpe, web: en_cours }
  origine: TDR                # TDR | RC-xxx | interne
  notes: ""
```

**Retour client** (`05-retours-client/RC-003.md`) : en-tête YAML (`id`, `date`, `source`,
`type` bug/evolution/question/remarque, `priorite`, `fonctionnalites`, `statut`
nouveau/en_cours/resolu/rejete, `date_resolution`), puis le texte du retour, l'analyse et la réponse.

**Campagne de recette** (`04-recette/campagnes/R2.yaml`) : `id`, `titre`, `date`, `type`
(interne/client), `resultats` (une ligne par test : `ok` / `ko` / `reserve` / `non_teste`).

**Journal** (`03-journal/actions/…jsonl`) : une ligne JSON par action (`ts`, `depot`, `auteur`,
`evt` modification/creation/commande/commit/doc/agent, `fichier`, `commande`, `hash`, `message`).
Les mots de passe, clés et jetons visibles dans les commandes sont masqués.

---

## 6. Calcul des indicateurs

| Indicateur | Calcul |
|---|---|
| Avancement d'une fonctionnalité | à faire 0 %, en cours / bloqué 30 %, développé 70 %, recetté 90 %, validé client 100 %. Avec plusieurs dépôts : moyenne des statuts par dépôt (jusqu'au stade « développé ») |
| Avancement global / par lot | moyenne pondérée par le `poids` des fonctionnalités (hors abandonnées) |
| Couverture du TDR | part des exigences liées à au moins une fonctionnalité |
| Recette OK | part des tests dont le dernier résultat est OK |
| Délai de résolution | moyenne `date_resolution − date` des retours résolus |

**Alertes générées automatiquement :**
- fonctionnalité bloquée ;
- test KO sur une fonctionnalité recettée ou validée ;
- fonctionnalité développée sans cas de test ;
- retour de priorité haute ouvert depuis plus de 7 jours ;
- exigence obligatoire non couverte ;
- livraison proche (14 jours ou moins) avec un avancement inférieur à 80 %, ou date dépassée ;
- fonctionnalité en cours sans activité depuis 14 jours ;
- donnée incohérente (id inconnu, YAML invalide…).

Les poids se règlent dans `scripts/lib/pilotage.mjs` (`POIDS_STATUT`). Le seuil de rappel
de documentation se règle par projet dans `projet.yaml` (`agent.seuil_rappel_doc`).

---

## 7. Travail en équipe

- **Retours clients.** Toi ou ton équipe les saisissez avec `/retour-client` (en collant le mail ou le compte rendu), ou en copiant `modeles/retour-client.md` à la main.
- **Postes des collègues.** Chacun clone le dépôt de pilotage à côté des dépôts de code, puis lance `node scripts/installer.mjs --repo ../dgh-backend`. Le projet et le dépôt sont déjà indiqués dans le fichier versionné `.claude/pilotage.json`. Si le dépôt de pilotage n'est pas installé, les hooks se désactivent silencieusement et ne bloquent jamais le développement.
- **Conflits git.** Le journal est découpé par mois, dépôt et auteur, donc deux personnes n'écrivent jamais dans le même fichier. Pour les fichiers partagés (`01-fonctionnalites.yaml`…), `/fin-session` fait un `git pull --rebase` avant de commiter.
- **Modèle du sous-agent.** Le documentaliste utilise `model: sonnet` pour limiter le coût. Tu peux changer ce réglage dans `kit-claude/agents/documentaliste.md`.

## Licence

MIT
