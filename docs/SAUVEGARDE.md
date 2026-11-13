# Sauvegardes et restauration

## Ce qui est sauvegardé

| Donnée | Où | Sauvegarde |
|---|---|---|
| Base PostgreSQL | Neon | **Historique Neon** (restauration à un instant donné, durée selon l'offre) **+** `pg_dump` quotidien |
| Fichiers (scans signés, TDR, annexes) | Vercel Blob (privé) | copie quotidienne de tous les fichiers |

La tâche GitHub Actions `.github/workflows/sauvegarde.yml` tourne chaque nuit (02:17 UTC) et conserve chaque
sauvegarde 30 jours (artefact « sauvegarde-<n° d'exécution> »). Elle exige deux secrets du dépôt :
`DATABASE_URL` (chaîne de connexion Neon) et `BLOB_READ_WRITE_TOKEN` (jeton du store Blob).
Elle peut aussi être lancée à la main (Actions → Sauvegarde quotidienne → Run workflow).

Une sauvegarde contient `base.dump` (format `pg_dump -Fc`), `fichiers/` et `manifeste.json`.

## Sauvegarde manuelle

```bash
DATABASE_URL=… BLOB_READ_WRITE_TOKEN=… node scripts/sauvegarde.mjs
```

## Restaurer

1. **Erreur récente dans la base** : préférer la restauration à un instant donné de Neon (console Neon → Branches →
   Restore), sur une branche, puis basculer `DATABASE_URL` de Vercel si le résultat est bon.
2. **Depuis une sauvegarde** : télécharger l'artefact, le décompresser, puis
   ```bash
   DATABASE_URL=<base cible> BLOB_READ_WRITE_TOKEN=<store cible> node scripts/restauration.mjs <dossier>
   ```
   `--base-seulement` ou `--fichiers-seulement` pour ne restaurer qu'une partie. Restaurer d'abord dans une base
   vide (branche Neon de test), vérifier l'application, puis seulement remplacer la production.
3. Redéployer l'API (les migrations s'appliquent au build) et vérifier `GET /api/v1/sante`.

## Tester la procédure

Une fois par trimestre : restaurer la dernière sauvegarde dans une branche Neon de test et un store Blob de test,
pointer un déploiement de prévisualisation dessus, ouvrir un projet et télécharger un scan signé.
