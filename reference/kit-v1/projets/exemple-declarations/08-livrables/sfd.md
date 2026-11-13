# Spécifications fonctionnelles détaillées (v0.6)

## 1. Acteurs
| Profil | Description |
|---|---|
| Entreprise | Dépose les déclarations |
| Agent | Contrôle les déclarations |
| Superviseur | Gère les agents, consulte les statistiques |

## 3. Spécifications par fonctionnalité
### F-001 — Inscription et connexion des entreprises
- **Exigences couvertes :** EX-01
- **Règles de gestion :**
  - RG-001-1 : le lien d'activation est valable 48 h.
  - RG-001-2 : après 5 échecs de connexion, le compte est bloqué 15 minutes.

### F-003 — Formulaire de déclaration mensuelle
- **Exigences couvertes :** EX-03
- **Règles de gestion :**
  - RG-003-1 : une seule déclaration par entreprise et par mois.
  - RG-003-2 : les rubriques suivent l'ordre du formulaire papier (RC-001).

*(Lot 2 en cours de rédaction.)*
