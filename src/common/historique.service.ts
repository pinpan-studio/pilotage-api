import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Historique } from '../db/entities';
import { Acteur } from './acteur';

/** Journal d'audit : enregistre chaque champ modifié, avec l'auteur (humain ou agent) et la session. */
@Injectable()
export class HistoriqueService {
  async tracer(em: EntityManager, a: Acteur, entite: string, avant: Record<string, any> | null, apres: Record<string, any>, opts: { projet_id?: string | null; session_id?: string | null } = {}) {
    const champs = Object.keys(apres).filter((k) => !['modifie_le', 'cree_le'].includes(k) && JSON.stringify(avant?.[k] ?? null) !== JSON.stringify(apres[k] ?? null));
    if (!champs.length) return;
    await em.insert(Historique, champs.map((champ) => ({
      organisation_id: a.organisation_id, projet_id: opts.projet_id ?? apres.projet_id ?? null,
      entite, entite_id: apres.id, champ,
      ancienne_valeur: avant ? (avant[champ] ?? null) : null, nouvelle_valeur: apres[champ] ?? null,
      auteur_type: a.auteur_type, auteur_id: a.utilisateur_id, session_id: opts.session_id ?? null,
    })));
  }
}
