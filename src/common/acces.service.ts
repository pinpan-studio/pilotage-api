import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MembreProjet, Projet } from '../db/entities';
import { Acteur } from './acteur';
import { introuvable, refuse } from './erreurs';

/**
 * Cloisonnement strict : organisation, puis projet.
 * - admin : tous les projets de son équipe (rôle chef de projet partout) ;
 * - membre d'un projet : son rôle sur ce projet ;
 * - membre interne de l'équipe (chef de projet, développeur) non membre du projet : selon la visibilité du projet
 *   (« equipe » → développeur, « equipe_lecture » → lecture, « membres » → invisible) ;
 * - client (lecteur dans l'équipe) : uniquement les projets dont il est membre ;
 * - jeton d'API / OAuth : comme son titulaire, limité aux projets du jeton s'il en liste.
 */
@Injectable()
export class AccesService {
  constructor(
    @InjectRepository(Projet) private readonly projets: Repository<Projet>,
    @InjectRepository(MembreProjet) private readonly membres: Repository<MembreProjet>,
  ) {}

  /** Rôle dans l'équipe : celui du compte (ou du jeton à rôle, déjà plafonné par son titulaire). */
  async roleEquipe(a: Acteur): Promise<string> {
    if (a.role !== 'agent') return a.role;
    const r = await this.projets.manager.query('SELECT role FROM utilisateur WHERE id = $1', [a.utilisateur_id]);
    return r[0]?.role ?? 'client_lecteur';
  }

  async idsAccessibles(a: Acteur): Promise<string[] | 'tous'> {
    const role = await this.roleEquipe(a);
    let ids: string[] | 'tous';
    if (role === 'admin') ids = 'tous';
    else {
      const membre = (await this.membres.find({ where: { utilisateur_id: a.utilisateur_id, organisation_id: a.organisation_id } })).map((m) => m.projet_id);
      const ouverts = role === 'client_lecteur' ? [] : (await this.projets.find({ select: { id: true }, where: { organisation_id: a.organisation_id, visibilite: In(['equipe', 'equipe_lecture']) } })).map((p) => p.id);
      ids = [...new Set([...membre, ...ouverts])];
    }
    if (a.jeton_id && a.projets_jeton?.length) {
      const jeton = a.projets_jeton;
      ids = ids === 'tous' ? jeton : ids.filter((id) => jeton.includes(id));
    }
    return ids;
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

  /** Rôle humain sur le projet, sans tenir compte du statut d'agent (admin vaut chef de projet). */
  private async roleHumain(a: Acteur, projet: Projet): Promise<'chef_projet' | 'developpeur' | 'client_lecteur'> {
    const role = await this.roleEquipe(a);
    if (role === 'admin') return 'chef_projet';
    const m = await this.membres.findOneBy({ projet_id: projet.id, utilisateur_id: a.utilisateur_id });
    if (m) return m.role;
    if (role !== 'client_lecteur' && projet.visibilite === 'equipe') return 'developpeur';
    return 'client_lecteur';
  }

  /** Rôle de l'acteur sur le projet. Un agent reste « agent » là où son titulaire peut écrire, lecteur sinon. */
  async roleSurProjet(a: Acteur, projet: Projet): Promise<'chef_projet' | 'developpeur' | 'client_lecteur' | 'agent'> {
    const r = await this.roleHumain(a, projet);
    if (a.role === 'agent') return r === 'client_lecteur' ? 'client_lecteur' : 'agent';
    // Un jeton à rôle ne dépasse pas le rôle porté par le jeton.
    if (a.jeton_id && a.role === 'client_lecteur') return 'client_lecteur';
    if (a.jeton_id && a.role === 'developpeur' && r === 'chef_projet') return 'developpeur';
    return r;
  }

  async exigerChefProjet(a: Acteur, projet: Projet, quoi: string) {
    if ((await this.roleSurProjet(a, projet)) !== 'chef_projet') throw refuse(`seul un chef de projet peut ${quoi}.`);
  }

  async exigerEcriture(a: Acteur, projet: Projet) {
    if ((await this.roleSurProjet(a, projet)) === 'client_lecteur') throw refuse('accès en lecture seule sur ce projet.');
  }
}
