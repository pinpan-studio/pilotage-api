import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Projet } from '../db/entities';
import { aujourdhui, calculer, Indicateurs, ModeleProjet, verifier } from './calcul';
import { chargerModele } from './chargeur';

/** Calcul des indicateurs et alertes d'un projet : logique de pilotage.mjs du kit v1, appliquée aux données en base. */
@Injectable()
export class IndicateursService {
  constructor(private readonly db: DataSource) {}

  async modele(projet: Projet): Promise<ModeleProjet> {
    const m = await chargerModele(this.db.manager, projet);
    // En v2, les « données incohérentes » sont les erreurs de cohérence détectées par verifier().
    m.erreurs = verifier(m).erreurs;
    return m;
  }

  async calculer(projet: Projet, maintenant = aujourdhui()): Promise<{ modele: ModeleProjet; indicateurs: Indicateurs }> {
    const modele = await this.modele(projet);
    return { modele, indicateurs: calculer(modele, { maintenant }) };
  }
}
