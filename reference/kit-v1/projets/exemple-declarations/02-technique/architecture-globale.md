# Architecture globale

## Vue d'ensemble
Trois dépôts : une API Laravel (`backend`) consommée par le portail Vue (`web`) et par l'application Flutter (`mobile`).

## Dépôts et responsabilités
| Dépôt | Rôle |
|---|---|
| backend | API REST, règles métier, génération des PDF, stockage des pièces |
| web | Portail entreprises et back-office administration |
| mobile | Consultation des déclarations, notifications |

## Flux principaux
1. L'entreprise saisit sa déclaration sur le portail → `POST /api/declarations`.
2. L'API enregistre, génère l'accusé PDF et notifie l'administration.
3. Un agent valide ou rejette → `PATCH /api/declarations/{id}/decision`.

## Environnements
- Recette : staging (déploiement automatique sur la branche `develop`)
- Production : à définir avec le client

Voir aussi : [API backend](backend/api.md) · [Décision ADR-001](decisions/ADR-001.md)
