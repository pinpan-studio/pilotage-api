---
description: Ajoute ou met à jour une entrée des registres de gestion (risque, action, changement, jalon, partie prenante, document)
argument-hint: <risque|action|changement|jalon|partie-prenante|document> <description>
---

Mets à jour le registre de gestion : $ARGUMENTS

| Registre | Fichier | Id |
|---|---|---|
| risque | `07-gestion/risques.yaml` | R-xxx |
| action | `07-gestion/actions.yaml` | A-xxx |
| changement | `07-gestion/changements.yaml` | DC-xxx |
| jalon | `07-gestion/planning.yaml` | J-x |
| partie-prenante | `07-gestion/parties-prenantes.yaml` | — |
| document | `documents.yaml` | code du catalogue |

1. Lis le fichier concerné (les formats sont décrits en commentaire en tête du fichier).
2. Ajoute une entrée (prochain id libre) ou modifie l'entrée désignée. Respecte les valeurs
   autorisées des statuts.
3. Risque : estime `probabilite` et `impact` (1 à 4) en expliquant ton estimation en une ligne,
   et propose une parade.
4. Demande de changement : analyse l'impact sur le délai, le coût et les fonctionnalités en
   t'appuyant sur le TDR et `01-fonctionnalites.yaml`. Laisse `decision: en_analyse` : la
   décision revient au client / COPIL. Si elle est acceptée, crée les fonctionnalités
   correspondantes (`origine: DC-xxx`) et renseigne `fonctionnalites`.
5. Lance `node <racine>/scripts/verifier.mjs <projet>` et confirme la modification en une ligne.
