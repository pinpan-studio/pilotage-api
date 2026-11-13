# API backend

Base : `/api` · Authentification : jeton Bearer (Laravel Sanctum).

| Méthode | Route | Description | Fonctionnalité |
|---|---|---|---|
| POST | `/auth/inscription` | Création d'un compte entreprise | F-001 |
| POST | `/auth/connexion` | Connexion, renvoie un jeton | F-001 |
| GET | `/declarations` | Liste des déclarations de l'entreprise | F-003 |
| POST | `/declarations` | Création / soumission | F-003 |
| PUT | `/declarations/{id}/brouillon` | Enregistrement automatique | F-009 |
| POST | `/declarations/{id}/pieces` | Ajout d'une pièce justificative (10 Mo max) | F-004 |

## Codes d'erreur
- `422` : validation (détail par champ)
- `423` : compte temporairement bloqué après 5 échecs
