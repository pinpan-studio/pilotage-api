import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { JetonApi, JetonRafraichissement, Utilisateur } from '../db/entities';
import { Acteur } from '../common/acteur';
import { genererJetonApi, genererJetonRafraichissement, hacher, prefixeDe, PREFIXE_JETON_API } from './jetons';
import { introuvable, invalide } from '../common/erreurs';

const DUREE_REFRESH_J = 30;

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    @InjectRepository(Utilisateur) private readonly utilisateurs: Repository<Utilisateur>,
    @InjectRepository(JetonApi) private readonly jetonsApi: Repository<JetonApi>,
    @InjectRepository(JetonRafraichissement) private readonly refresh: Repository<JetonRafraichissement>,
  ) {}

  async connexion(email: string, motDePasse: string) {
    const u = await this.utilisateurs.findOneBy({ email: email.trim().toLowerCase(), actif: true });
    const ok = u?.mot_de_passe_hache ? await argon2.verify(u.mot_de_passe_hache, motDePasse).catch(() => false) : false;
    if (!u || !ok) throw new UnauthorizedException('Identifiants incorrects.');
    return this.emettre(u);
  }

  async rafraichir(jeton: string) {
    const r = await this.refresh.findOneBy({ hache: hacher(jeton), revoque_le: IsNull() });
    if (!r || r.expire_le < new Date()) throw new UnauthorizedException('Session expirée, reconnectez-vous.');
    const u = await this.utilisateurs.findOneBy({ id: r.utilisateur_id, actif: true });
    if (!u) throw new UnauthorizedException('Compte désactivé.');
    await this.refresh.update(r.id, { revoque_le: new Date() }); // rotation
    return this.emettre(u);
  }

  async deconnexion(jeton: string) {
    await this.refresh.update({ hache: hacher(jeton) }, { revoque_le: new Date() });
  }

  private async emettre(u: Utilisateur) {
    const jeton_acces = await this.jwt.signAsync({ sub: u.id, org: u.organisation_id, role: u.role, nom: u.nom });
    const jeton_rafraichissement = genererJetonRafraichissement();
    await this.refresh.save(this.refresh.create({
      utilisateur_id: u.id, hache: hacher(jeton_rafraichissement),
      expire_le: new Date(Date.now() + DUREE_REFRESH_J * 86400_000),
    }));
    return { jeton_acces, expire_dans: 900, jeton_rafraichissement, utilisateur: { id: u.id, email: u.email, nom: u.nom, role: u.role } };
  }

  /** Résout un en-tête « Bearer » en acteur (JWT ou jeton d'API). */
  async resoudre(bearer: string): Promise<Acteur> {
    if (bearer.startsWith(PREFIXE_JETON_API)) {
      const j = await this.jetonsApi.findOneBy({ prefixe: prefixeDe(bearer) });
      if (!j || j.hache !== hacher(bearer) || j.revoque_le || (j.expire_le && j.expire_le < new Date()))
        throw new UnauthorizedException("Jeton d'API invalide, expiré ou révoqué.");
      const u = await this.utilisateurs.findOneBy({ id: j.utilisateur_id, actif: true });
      if (!u) throw new UnauthorizedException("Le développeur lié à ce jeton est désactivé.");
      this.jetonsApi.update(j.id, { utilise_le: new Date() }).catch(() => undefined);
      return { utilisateur_id: u.id, organisation_id: u.organisation_id, nom: u.nom, role: 'agent', auteur_type: 'agent', projets_jeton: j.projets, jeton_id: j.id };
    }
    try {
      const p = await this.jwt.verifyAsync(bearer);
      return { utilisateur_id: p.sub, organisation_id: p.org, nom: p.nom, role: p.role, auteur_type: 'humain' };
    } catch {
      throw new UnauthorizedException('Jeton expiré ou invalide.');
    }
  }

  // ------------------------------------------------------------ jetons d'API

  async creerJetonApi(admin: Acteur, dto: { utilisateur_id: string; nom: string; projets: string[]; expire_le?: string }) {
    const u = await this.utilisateurs.findOneBy({ id: dto.utilisateur_id, organisation_id: admin.organisation_id });
    if (!u) throw introuvable('utilisateur');
    if (u.role === 'client_lecteur') throw invalide("un jeton d'agent doit être lié à un développeur ou un chef de projet.");
    const g = genererJetonApi();
    const j = await this.jetonsApi.save(this.jetonsApi.create({
      organisation_id: admin.organisation_id, cree_par: admin.utilisateur_id, utilisateur_id: u.id,
      nom: dto.nom, prefixe: g.prefixe, hache: g.hache, projets: dto.projets,
      expire_le: dto.expire_le ? new Date(dto.expire_le) : null,
    }));
    return { ...this.vueJeton(j), jeton: g.jeton, avertissement: "Ce jeton ne sera plus jamais affiché : copiez-le maintenant." };
  }

  async listerJetons(a: Acteur) {
    return (await this.jetonsApi.find({ where: { organisation_id: a.organisation_id }, order: { cree_le: 'DESC' } })).map((j) => this.vueJeton(j));
  }

  async revoquerJeton(a: Acteur, id: string) {
    const r = await this.jetonsApi.update({ id, organisation_id: a.organisation_id }, { revoque_le: new Date() });
    if (!r.affected) throw introuvable('jeton');
  }

  private vueJeton(j: JetonApi) {
    return { id: j.id, nom: j.nom, prefixe: j.prefixe, utilisateur_id: j.utilisateur_id, projets: j.projets, expire_le: j.expire_le, revoque_le: j.revoque_le, utilise_le: j.utilise_le, cree_le: j.cree_le };
  }
}
