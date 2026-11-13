# pilotage-api

Backend de l'application **Pilotage** : API REST (`/api/v1`), serveur MCP (`/mcp`), journal des
hooks Claude Code, indicateurs et alertes. Cahier des charges : [`docs/PROMPT-APPLICATION.md`](docs/PROMPT-APPLICATION.md).
Le kit v1 (spécification exécutable) est dans `reference/kit-v1/`.

## Démarrage en local

Prérequis : Node.js 22, PostgreSQL 16 (ou `docker compose up postgres`).

```bash
cp .env.example .env            # renseigner JWT_SECRET, ADMIN_EMAIL, ADMIN_MOT_DE_PASSE
npm install
npm run migration:run
SEED_DEMO=1 npm run seed        # catalogue, modèles, administrateur, projet fictif d'exemple
npm run dev                     # http://localhost:3000/api/v1/sante
npm test                        # base pilotage_test (DATABASE_URL_TEST)
```

| Script | Rôle |
|---|---|
| `npm run openapi` | régénère `openapi/openapi.json` (à commiter avec toute évolution de l'API) |
| `npm run migration:generate` / `migration:run` | migrations TypeORM |
| `npm run seed` | seed idempotent (`SEED_DEMO=1` : importe `exemple-declarations`) |

Production : base **Neon** (`DATABASE_URL` avec `sslmode=require`), fichiers sur **Vercel Blob**
(`BLOB_READ_WRITE_TOKEN`), API conteneurisée (`Dockerfile`, migrations au démarrage avec
`MIGRATIONS_AU_DEMARRAGE=1`).

## Déploiement sur Vercel

L'API tourne en fonction serverless (`api/index.js` → `dist/serverless.js`, instance Nest réutilisée).
1. Vercel → **Add New → Project** → importer `pilotage-api` (les réglages viennent de `vercel.json`).
2. **Storage → Neon** (Marketplace) → créer la base et la connecter au projet : `DATABASE_URL` est
   ajoutée automatiquement (utiliser la chaîne *pooled*).
3. **Storage → Blob** → créer un store **Private** et le connecter au projet : `BLOB_READ_WRITE_TOKEN`
   est ajoutée automatiquement.
4. **Settings → Environment Variables** : `JWT_SECRET` (≥ 32 caractères aléatoires), `WEB_ORIGIN`
   (ex. `https://pilotage-web.vercel.app`), `ADMIN_EMAIL`, `ADMIN_MOT_DE_PASSE`, et `SEED_DEMO=1` pour
   importer le projet d'exemple.
5. Déployer : en production, le build exécute les migrations puis le seed (`scripts-vercel-build.sh`).

Limites Vercel : 4 Mo par fichier téléversé (corps de requête limité à 4,5 Mo) ; limitation de débit
par instance.

## Organisation

```
src/
  db/          entités (schéma du §5), migrations, seed (catalogue + modèles du kit v1)
  auth/        JWT 15 min + rafraîchissement à rotation, jetons d'API (rôle agent)
  common/      cloisonnement (AccesService), restrictions de l'agent (ReglesAgent), audit, limitation de débit
  indicateurs/ calcul.ts = portage à l'identique de pilotage.mjs ; chargeur base → modèle du kit
  import/      import d'un dossier projets/<code> du kit v1 (POST /import/kit-v1)
  lecture/     API REST en lecture, référentiels
  ecriture/    écritures métier communes REST / MCP
  mcp/         serveur MCP (outils de lecture et d'écriture)
  journal/     POST /journal (lots idempotents), sessions et état pour les hooks
claude-kit/    kit Claude Code v2 : hooks (file hors ligne), documentaliste, commandes, installeur
openapi/       contrat OpenAPI généré (consommé par pilotage-web)
```

## Brancher Claude Code

1. Un administrateur crée un **jeton d'API** pour le développeur (`POST /api/v1/jetons`,
   bientôt dans l'interface) ; il n'est affiché qu'une fois.
2. Sur le poste : `export PILOTAGE_TOKEN=plt_…` (jamais dans un fichier versionné).
3. Dans le dépôt de code :
   ```bash
   node <pilotage-api>/claude-kit/installer.mjs --repo . --api https://<api> --projet <code> --depot backend
   ```
   ou, sans installeur, pour le serveur MCP seul :
   ```bash
   claude mcp add --transport http pilotage https://<api>/mcp --header "Authorization: Bearer $PILOTAGE_TOKEN"
   ```
4. Ouvrir Claude Code : « donne-moi l'état du projet », « ajoute une note de session ».

Hors ligne, les hooks écrivent dans `~/.pilotage/file-attente.jsonl` et renvoient au prochain
appel réussi (`node .claude/hooks/pilotage.mjs etat-file` pour voir la file).
