import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { Acteur, PUBLIC, ROLES } from '../common/acteur';
import { refuse } from '../common/erreurs';

/** Garde globale : toute route exige un JWT ou un jeton d'API, sauf @Public(). @Roles() restreint les rôles. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService, private readonly reflector: Reflector) {}
  async canActivate(ctx: ExecutionContext) {
    const cibles = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, cibles)) return true;
    const req = ctx.switchToHttp().getRequest();
    const h: string = req.headers.authorization ?? '';
    if (!h.startsWith('Bearer ')) throw new UnauthorizedException('Authentification requise.');
    const acteur: Acteur = await this.auth.resoudre(h.slice(7).trim());
    req.acteur = acteur;
    const roles = this.reflector.getAllAndOverride<Acteur['role'][]>(ROLES, cibles);
    if (roles && !roles.includes(acteur.role)) throw refuse('droits insuffisants pour cette opération.');
    return true;
  }
}
