import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

/** Identité de l'appelant, résolue par AuthGuard (JWT de l'interface ou jeton d'API de l'agent). */
export interface Acteur {
  utilisateur_id: string;
  organisation_id: string;
  nom: string;
  /** Rôle effectif : un jeton d'API donne toujours le rôle « agent ». */
  role: 'admin' | 'chef_projet' | 'developpeur' | 'client_lecteur' | 'agent';
  auteur_type: 'humain' | 'agent';
  /** Projets autorisés par le jeton d'API (agent uniquement). */
  projets_jeton?: string[];
  jeton_id?: string;
}

export const ActeurCourant = createParamDecorator((_: unknown, ctx: ExecutionContext): Acteur => ctx.switchToHttp().getRequest().acteur);

export const PUBLIC = 'route_publique';
export const Public = () => SetMetadata(PUBLIC, true);
export const ROLES = 'roles_autorises';
export const Roles = (...roles: Acteur['role'][]) => SetMetadata(ROLES, roles);
