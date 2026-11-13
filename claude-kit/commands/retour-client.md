---
description: Enregistre un retour client (mail, réunion, appel…) et le rattache aux fonctionnalités
argument-hint: <texte du retour collé, source, date>
---

Enregistre ce retour client : $ARGUMENTS

1. Reformule fidèlement le retour (conserve les citations exactes importantes, aucune donnée
   personnelle superflue). Détermine : date (aujourd'hui si non précisée), source, contact,
   type (bug / evolution / question / remarque), priorité.
2. Rattache-le aux fonctionnalités concernées (`lister_fonctionnalites`, `rechercher`).
3. `creer_retour` (la référence RC-xxx est attribuée par le serveur). Ajoute une courte
   analyse (cause probable, impact) via `maj_retour` si disponible, sinon dans ton résumé.
4. **Évolution** hors périmètre du TDR : propose une nouvelle fonctionnalité ou une demande
   de changement, mais **demande-moi confirmation** avant : cela peut nécessiter un avenant.
5. Plusieurs retours dans le texte → un retour par point.
6. Résume ce qui a été enregistré (références).

Quand un retour est traité : `maj_retour <RC-xxx> resolu` avec l'action / réponse apportée.
