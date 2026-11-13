import { Inject, Injectable, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { JetonApi, JetonRafraichissement, Utilisateur } from '../db/entities';
import { Acteur } from '../common/acteur';
import { genererJetonApi, genererJetonRafraichissement, hacher, prefixeDe, PREFIXE_JETON_API } from './jetons';
import { introuvable, invalide } from '../common/erreurs';

const DUREE_REFRESH_J = 30;

/** Contexte de la connexion (affiché dans la liste des sessions). */
export interface ContexteConnexion { appareil?: string; ip?: string }

/** Vérification d'un jeton d'identité Google (remplaçable dans les tests). */
export interface VerificateurGoogle { verifier(credential: string): Promise<{ sub: string; email: string; email_verified: boolean; name?: string; picture?: string }> }
export const VERIFICATEUR_GOOGLE = 'VERIFICATEUR_GOOGLE';
export class VerificateurGoogleOfficiel implements VerificateurGoogle {
  private readonly client = new OAuth2Client();
  async verifier(credential: string) {
    const audience = process.env.GOOGLE_CLIENT_ID;
    if (!audience) throw new ServiceUnavailableException('Connexion Google non configurée (GOOGLE_CLIENT_ID manquant).');
    const ticket = await this.client.verifyIdToken({ idToken: credential, audience });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email) throw new UnauthorizedException('Jeton Google invalide.');
    return { sub: p.sub, email: p.email, email_verified: !!p.email_verified, name: p.name, picture: p.picture };
  }
}

const RANG: Record<string, number> = { client_lecteur: 0, developpeur: 1, chef_projet: 2, admin: 3 };
/** Le rôle d'un jeton ne dépasse jamais celui de son titulaire (même si ce dernier a été rétrogradé). */
function plafonner(r: string, titulaire: string): any { return RANG[r] <= RANG[titulaire] ? r : titulaire; }

@Injectable()
export class AuthService {
  constructor(
    @Inject(VERIFICATEUR_GOOGLE) private readonly google: VerificateurGoogle,
    private readonly jwt: JwtService,
    @InjectRepository(Utilisateur) private readonly utilisateurs: Repository<Utilisateur>,
    @InjectRepository(JetonApi) private readonly jetonsApi: Repository<JetonApi>,
    @InjectRepository(JetonRafraichissement) private readonly refresh: Repository<JetonRafraichissement>,
  ) {}

  /** Mot de passe : parmi les comptes de cette personne (une ligne par équipe), celui dont le mot de passe correspond, le plus récemment utilisé. */
  async connexion(email: string, motDePasse: string, ctx: ContexteConnexion = {}) {
    const comptes = await this.utilisateurs.createQueryBuilder('u').where('lower(u.email) = :e', { e: email.trim().toLowerCase() })
      .andWhere('u.actif = true').andWhere('u.mot_de_passe_hache IS NOT NULL').orderBy('u.derniere_connexion', 'DESC', 'NULLS LAST').getMany();
    for (const u of comptes) {
      if (await argon2.verify(u.mot_de_passe_hache!, motDePasse).catch(() => false)) return this.emettre(u, { ...ctx, methode: 'mot_de_passe' });
    }
    throw new UnauthorizedException('Identifiants incorrects.');
  }

  /** Compte actif pour cet e-mail ; avec plusieurs équipes, la dernière utilisée. */
  private parEmail(email: string) {
    return this.utilisateurs.createQueryBuilder('u').where('lower(u.email) = :e', { e: email.trim().toLowerCase() }).andWhere('u.actif = true')
      .orderBy('u.derniere_connexion', 'DESC', 'NULLS LAST').addOrderBy('u.cree_le').getOne();
  }

  /** Passe sur le compte de la même personne dans une autre équipe (nouvelle session). */
  async changerEquipe(a: Acteur, organisation_id: string, ctx: ContexteConnexion = {}) {
    const moi = await this.utilisateurs.findOneBy({ id: a.utilisateur_id });
    if (!moi) throw introuvable('utilisateur');
    const cible = await this.utilisateurs.createQueryBuilder('u').where('lower(u.email) = :e', { e: moi.email.toLowerCase() })
      .andWhere('u.organisation_id = :o', { o: organisation_id }).andWhere('u.actif = true').getOne();
    if (!cible) throw introuvable('équipe (vous n’en êtes pas membre)');
    if (moi.google_sub && !cible.google_sub) await this.utilisateurs.update(cible.id, { google_sub: moi.google_sub, photo_url: moi.photo_url });
    return this.emettre((await this.utilisateurs.findOneBy({ id: cible.id }))!, { ...ctx, methode: 'google' });
  }

  /** Connexion Google : le jeton d'identité est vérifié par le serveur (signature, audience, expiration). */
  async connexionGoogle(credential: string, ctx: ContexteConnexion = {}) {
    let g;
    try { g = await this.google.verifier(credential); } catch (e) {
      if (e instanceof ServiceUnavailableException) throw e;
      throw new UnauthorizedException('Jeton Google invalide ou expiré.');
    }
    if (!g.email_verified) throw new UnauthorizedException('Adresse Google non vérifiée.');
    let u = await this.utilisateurs.findOne({ where: { google_sub: g.sub, actif: true }, order: { derniere_connexion: { direction: 'DESC', nulls: 'LAST' } } }) ?? await this.parEmail(g.email);
    if (!u) throw new UnauthorizedException(`Aucun compte Pilotage pour ${g.email}. Demandez une invitation à l'administrateur de votre équipe.`);
    if (u.google_sub && u.google_sub !== g.sub) throw new UnauthorizedException('Ce compte est lié à un autre compte Google.');
    await this.utilisateurs.update(u.id, { google_sub: g.sub, photo_url: g.picture ?? u.photo_url, nom: u.nom === 'Administrateur' && g.name ? g.name : u.nom });
    u = (await this.utilisateurs.findOneBy({ id: u.id }))!;
    return this.emettre(u, { ...ctx, methode: 'google' });
  }

  async rafraichir(jeton: string, ctx: ContexteConnexion = {}) {
    const r = await this.refresh.findOneBy({ hache: hacher(jeton), revoque_le: IsNull() });
    if (!r || r.expire_le < new Date()) throw new UnauthorizedException('Session expirée, reconnectez-vous.');
    const u = await this.utilisateurs.findOneBy({ id: r.utilisateur_id, actif: true });
    if (!u) throw new UnauthorizedException('Compte désactivé.');
    await this.refresh.update(r.id, { revoque_le: new Date() }); // rotation
    return this.emettre(u, { methode: r.methode, appareil: ctx.appareil || r.appareil, ip: ctx.ip || r.ip, session_id: r.session_id ?? r.id }, false);
  }

  async deconnexion(jeton: string) {
    await this.refresh.update({ hache: hacher(jeton) }, { revoque_le: new Date() });
  }

  private async emettre(u: Utilisateur, ctx: ContexteConnexion & { methode: 'mot_de_passe' | 'google'; session_id?: string }, nouvelle = true) {
    const session_id = ctx.session_id ?? randomUUID();
    const jeton_acces = await this.jwt.signAsync({ sub: u.id, org: u.organisation_id, role: u.role, nom: u.nom, sid: session_id });
    const jeton_rafraichissement = genererJetonRafraichissement();
    await this.refresh.save(this.refresh.create({
      utilisateur_id: u.id, hache: hacher(jeton_rafraichissement), session_id, methode: ctx.methode,
      appareil: (ctx.appareil ?? '').slice(0, 200), ip: (ctx.ip ?? '').slice(0, 64), utilise_le: new Date(),
      expire_le: new Date(Date.now() + DUREE_REFRESH_J * 86400_000),
    }));
    if (nouvelle) await this.utilisateurs.update(u.id, { derniere_connexion: new Date() });
    return { jeton_acces, expire_dans: 900, jeton_rafraichissement, utilisateur: { id: u.id, email: u.email, nom: u.nom, role: u.role, photo_url: u.photo_url } };
  }

  // ------------------------------------------------------------ compte et sessions

  async profil(a: Acteur) {
    const u = await this.utilisateurs.findOneBy({ id: a.utilisateur_id });
    if (!u) throw introuvable('utilisateur');
    const org = await this.utilisateurs.manager.query('SELECT code, nom FROM organisation WHERE id = $1', [u.organisation_id]);
    return { id: u.id, email: u.email, nom: u.nom, role: u.role, photo_url: u.photo_url, google_lie: !!u.google_sub, mot_de_passe: !!u.mot_de_passe_hache,
      derniere_connexion: u.derniere_connexion, cree_le: u.cree_le, organisation: org[0] ?? null };
  }

  async majProfil(a: Acteur, nom: string) {
    const n = nom.trim();
    if (n.length < 2 || n.length > 120) throw invalide('le nom doit faire entre 2 et 120 caractères.');
    await this.utilisateurs.update(a.utilisateur_id, { nom: n });
    return this.profil(a);
  }

  /** Sessions actives = dernier jeton de rafraîchissement non révoqué de chaque session. */
  async sessions(a: Acteur) {
    const rows: any[] = await this.refresh.query(
      `SELECT DISTINCT ON (coalesce(session_id, id)) coalesce(session_id, id) AS id, methode, appareil, ip, utilise_le, cree_le, expire_le
       FROM jeton_rafraichissement WHERE utilisateur_id = $1 AND revoque_le IS NULL AND expire_le > now()
       ORDER BY coalesce(session_id, id), cree_le DESC`, [a.utilisateur_id]);
    const debuts: any[] = await this.refresh.query(`SELECT coalesce(session_id, id) AS id, min(cree_le) AS debut FROM jeton_rafraichissement WHERE utilisateur_id = $1 GROUP BY 1`, [a.utilisateur_id]);
    const debut = new Map(debuts.map((d) => [d.id, d.debut]));
    return rows.map((r) => ({ id: r.id, methode: r.methode, appareil: r.appareil, ip: r.ip, derniere_activite: r.utilise_le ?? r.cree_le, ouverte_le: debut.get(r.id) ?? r.cree_le, courante: r.id === a.session_id }))
      .sort((x, y) => +new Date(y.derniere_activite) - +new Date(x.derniere_activite));
  }

  async revoquerSession(a: Acteur, session_id: string) {
    const r = await this.refresh.query(`UPDATE jeton_rafraichissement SET revoque_le = now() WHERE utilisateur_id = $1 AND (session_id = $2 OR id = $2) AND revoque_le IS NULL`, [a.utilisateur_id, session_id]);
    if (!r[1]) throw introuvable('session');
  }

  async revoquerAutresSessions(a: Acteur) {
    const r = await this.refresh.query(`UPDATE jeton_rafraichissement SET revoque_le = now() WHERE utilisateur_id = $1 AND revoque_le IS NULL AND coalesce(session_id, id) <> coalesce($2::uuid, '00000000-0000-0000-0000-000000000000')`, [a.utilisateur_id, a.session_id ?? null]);
    return { revoquees: r[1] ?? 0 };
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
      return { utilisateur_id: u.id, organisation_id: u.organisation_id, nom: u.nom, role: j.role === 'agent' ? 'agent' : plafonner(j.role, u.role), auteur_type: 'agent', projets_jeton: j.projets, jeton_id: j.id };
    }
    try {
      const p = await this.jwt.verifyAsync(bearer);
      return { utilisateur_id: p.sub, organisation_id: p.org, nom: p.nom, role: p.role, auteur_type: 'humain', session_id: p.sid };
    } catch {
      throw new UnauthorizedException('Jeton expiré ou invalide.');
    }
  }

  // ------------------------------------------------------------ jetons d'API

  async creerJetonApi(admin: Acteur, dto: { utilisateur_id: string; nom: string; projets?: string[]; role?: JetonApi['role']; expire_le?: string }) {
    const u = await this.utilisateurs.findOneBy({ id: dto.utilisateur_id, organisation_id: admin.organisation_id });
    if (!u) throw introuvable('utilisateur');
    const role = dto.role ?? 'agent';
    if (role === 'agent' && u.role === 'client_lecteur') throw invalide("un jeton d'agent doit être lié à un développeur ou un chef de projet.");
    if (role !== 'agent' && RANG[role] > RANG[u.role]) throw invalide(`le rôle « ${role} » dépasse celui du titulaire (« ${u.role} »).`);
    const g = genererJetonApi();
    const j = await this.jetonsApi.save(this.jetonsApi.create({
      organisation_id: admin.organisation_id, cree_par: admin.utilisateur_id, utilisateur_id: u.id,
      nom: dto.nom, prefixe: g.prefixe, hache: g.hache, projets: dto.projets ?? [], role,
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
    return { id: j.id, nom: j.nom, prefixe: j.prefixe, utilisateur_id: j.utilisateur_id, projets: j.projets, role: j.role, expire_le: j.expire_le, revoque_le: j.revoque_le, utilise_le: j.utilise_le, cree_le: j.cree_le };
  }
}
