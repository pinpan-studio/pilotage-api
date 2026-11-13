import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MembreProjet, Projet } from '../db/entities';
import { Acteur } from './acteur';
import { introuvable, refuse } from './erreurs';

/**
 * Cloisonnement strict : organisation, puis projet.
 * - admin : tous les projets de son organisation ;
 * - chef_projet / developpeur / client_lecteur : projets dont il est membre ;
 * - agent : projets du jeton ET dont le développeur lié est membre (ou admin).
 */
@Injectable()
export class AccesService {
  constructor(
    @InjectRepository(Projet) private readonly projets: Repository<Projet>,
    @InjectRepository(MembreProjet) private readonly membres: Repository<MembreProjet>,
  ) {}

  async idsAccessibles(a: Acteur): Promise<string[] | 'tous'> {
    let ids: string[] | 'tous';
    const estAdmin = a.role === 'admin' || (a.role === 'agent' && (await this.estAdmin(a)));
    if (estAdmin) ids = 'tous';
    else ids = (await this.membres.find({ where: { utilisateur_id: a.utilisateur_id, organisation_id: a.organisation_id } })).map((m) => m.projet_id);
    if (a.role === 'agent') {
      const jeton = a.projets_jeton ?? [];
      ids = ids === 'tous' ? jeton : ids.filter((id) => jeton.includes(id));
    }
    return ids;
  }

  private async estAdmin(a: Acteur) {
    const r = await this.projets.manager.query('SELECT role FROM utilisateur WHERE id = $1', [a.utilisateur_id]);
    return r[0]?.role === 'admin';
  }

  async lister(a: Acteur): Promise<Projet[]> {
    const ids = await this.idsAccessibles(a);
    const qb = this.projets.createQueryBuilder('p').where('p.organisation_id = :org', { org: a.organisation_id }).orderBy('p.code');
    if (ids !== 'tous') { if (!ids.length) return []; qb.andWhere('p.id IN (:...ids)', { ids }); }
    return qb.getMany();
  }

  /** Résout un projet par son code et vérifie l'accès. Un projet inaccessible est « introuvable » (pas de fuite d'existence). */
  async projet(a: Acteur, code: string): Promise<Projet> {
    const p = await this.projets.findOneBy({ organisation_id: a.organisation_id, code });
    if (!p) throw introuvable(`projet « ${code} »`);
    const ids = await this.idsAccessibles(a);
    if (ids !== 'tous' && !ids.includes(p.id)) throw introuvable(`projet « ${code} »`);
    return p;
  }

  /** Rôle de l'acteur sur le projet (admin vaut chef de projet). */
  async roleSurProjet(a: Acteur, projet: Projet): Promise<'chef_projet' | 'developpeur' | 'client_lecteur' | 'agent'> {
    if (a.role === 'agent') return 'agent';
    if (a.role === 'admin') return 'chef_projet';
    const m = await this.membres.findOneBy({ projet_id: projet.id, utilisateur_id: a.utilisateur_id });
    return m?.role ?? 'client_lecteur';
  }

  async exigerChefProjet(a: Acteur, projet: Projet, quoi: string) {
    if ((await this.roleSurProjet(a, projet)) !== 'chef_projet') throw refuse(`seul un chef de projet peut ${quoi}.`);
  }

  async exigerEcriture(a: Acteur, projet: Projet) {
    if ((await this.roleSurProjet(a, projet)) === 'client_lecteur') throw refuse('accès en lecture seule sur ce projet.');
  }
}
