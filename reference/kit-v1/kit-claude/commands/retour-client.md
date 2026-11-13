---
description: Enregistre un retour client (mail, réunion, appel…) et le rattache aux fonctionnalités
argument-hint: <texte du retour collé, source, date>
---

Enregistre ce retour client : $ARGUMENTS

1. Crée `05-retours-client/RC-xxx.md` (prochain id libre) à partir de
   `<racine>/modeles/retour-client.md`. Renseigne : date (aujourd'hui si non précisée),
   source, contact client, `saisi_par` (utilisateur git), type (bug / evolution /
   question / remarque), priorité, statut `nouveau`.
2. Reformule fidèlement le retour dans « Retour du client ». Conserve les citations exactes
   importantes. N'y mets aucune donnée personnelle superflue (téléphone, etc.).
3. Rattache-le aux fonctionnalités concernées (`fonctionnalites: [F-xxx]`) en t'appuyant
   sur `01-fonctionnalites.yaml`. Rédige une courte « Analyse » (cause probable, impact).
4. S'il s'agit d'une **évolution** hors périmètre du TDR, propose une nouvelle
   fonctionnalité (`origine: RC-xxx`, `statut: a_faire`) mais **demande-moi confirmation**
   avant de l'ajouter : cela peut nécessiter un avenant.
5. S'il y a plusieurs retours dans le texte, crée un fichier par retour.
6. Lance `node <racine>/scripts/verifier.mjs <projet>` et résume ce qui a été enregistré.

Quand un retour est traité : mets `statut: resolu`, `date_resolution`, et complète
« Action / réponse apportée ».
