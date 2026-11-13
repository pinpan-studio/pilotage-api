---
description: Ajoute ou met à jour une entrée des registres de gestion (risque, action, changement)
argument-hint: <risque|action|changement> <description>
---

Mets à jour le registre de gestion : $ARGUMENTS

| Registre | Lecture | Écriture |
|---|---|---|
| risque (R-xxx) | `lister_risques` | `ajouter_risque` |
| action (A-xxx) | `lister_actions` | `ajouter_action`, `maj_action` |
| changement (DC-xxx) | `lister_changements` | `proposer_changement` |
| jalon, partie prenante, document | `lister_jalons`, `lister_documents` | interface (chef de projet) |

1. Lis le registre concerné pour éviter un doublon. La référence est attribuée par le serveur.
2. Risque : estime `probabilite` et `impact` (1 à 4) en expliquant ton estimation en une ligne,
   et propose une parade.
3. Demande de changement : analyse l'impact sur le délai, le coût et les fonctionnalités
   (`lire_tdr`, `lister_fonctionnalites`). La décision reste « en analyse » : elle revient au
   client / COPIL (l'API refuse toute autre valeur venant de l'agent).
4. Confirme l'écriture en une ligne.
