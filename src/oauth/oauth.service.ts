import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import * as E from '../db/entities';
import { Acteur } from '../common/acteur';
import { AccesService } from '../common/acces.service';
import { genererJetonApi, hacher } from '../auth/jetons';

const RANG: Record<string, number> = { client_lecteur: 0, developpeur: 1, chef_projet: 2, admin: 3 };
/** Durée de vie du jeton d'accès délivré (un jeton d'API) et du jeton de rafraîchissement. */
export const DUREE_ACCES_S = 30 * 24 * 3600;
const DUREE_RAFRAICHISSEMENT_MS = 180 * 24 * 3600 * 1000;

/** Erreur OAuth au format RFC 6749 (§5.2). */
export class ErreurOAuth extends BadRequestException {
  constructor(error: string, description: string) { super({ error, error_description: description }); }
}

/** Serveur d'autorisation OAuth 2.1 du MCP : enregistrement dynamique, code + PKCE (S256), rafraîchissement avec rotation. */
@Injectable()
export class OAuthService {
  constructor(
    @InjectRepository(E.OAuthClient) private readonly clients: Repository<E.OAuthClient>,
    @InjectRepository(E.OAuthCode) private readonly codes: Repository<E.OAuthCode>,
    @InjectRepository(E.OAuthRafraichissement) private readonly rafraichissements: Repository<E.OAuthRafraichissement>,
    @InjectRepository(E.JetonApi) private readonly jetons: Repository<E.JetonApi>,
    @InjectRepository(E.Utilisateur) private readonly utilisateurs: Repository<E.Utilisateur>,
    private readonly acces: AccesService,
  ) {}

  /** https, http://localhost (outils locaux) ou schéma d'application (ex. cursor://) ; jamais javascript:, data:, file:. */
  static uriValide(u: string) {
    try {
      const x = new URL(u);
      if (x.protocol === 'https:') return true;
      if (x.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(x.hostname);
      return !['javascript:', 'data:', 'file:', 'vbscript:', 'blob:'].includes(x.protocol);
    } catch { return false; }
  }

  async enregistrer(x: { client_name?: string; redirect_uris?: string[] }) {
    const uris = (x.redirect_uris ?? []).filter((u) => typeof u === 'string');
    if (!uris.length || !uris.every(OAuthService.uriValide)) throw new ErreurOAuth('invalid_redirect_uri', 'redirect_uris : au moins une URI https (ou http://localhost) attendue.');
    const c = await this.clients.save(this.clients.create({ nom: (x.client_name || 'Assistant IA').slice(0, 120), redirect_uris: uris }));
    return { client_id: c.id, client_name: c.nom, redirect_uris: c.redirect_uris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
      client_id_issued_at: Math.floor(c.cree_le.getTime() / 1000) };
  }

  /** Vérifie une demande d'autorisation ; renvoie le client (pour la page de consentement). */
  async verifierDemande(client_id: string, redirect_uri: string, code_challenge?: string, methode?: string) {
    const c = /^[0-9a-f-]{36}$/i.test(client_id ?? '') ? await this.clients.findOneBy({ id: client_id }) : null;
    if (!c) throw new ErreurOAuth('invalid_client', 'client_id inconnu.');
    if (!c.redirect_uris.includes(redirect_uri)) throw new ErreurOAuth('invalid_request', 'redirect_uri non enregistrée pour ce client.');
    if (code_challenge !== undefined && (!code_challenge || (methode ?? 'S256') !== 'S256')) throw new ErreurOAuth('invalid_request', 'PKCE obligatoire (code_challenge_method=S256).');
    return c;
  }

  async client(id: string) {
    const c = /^[0-9a-f-]{36}$/i.test(id) ? await this.clients.findOneBy({ id }) : null;
    if (!c) throw new ErreurOAuth('invalid_client', 'client_id inconnu.');
    return { client_id: c.id, nom: c.nom, redirect_uris: c.redirect_uris };
  }

  /** Consentement donné par un humain connecté : crée le code et renvoie l'URL de retour vers l'assistant. */
  async approuver(a: Acteur, x: { client_id: string; redirect_uri: string; code_challenge: string; state?: string; role?: string; projets?: string[] }) {
    if (a.auteur_type !== 'humain') throw new ErreurOAuth('access_denied', 'le consentement doit être donné par une personne connectée.');
    await this.verifierDemande(x.client_id, x.redirect_uri, x.code_challenge, 'S256');
    const u = await this.utilisateurs.findOneByOrFail({ id: a.utilisateur_id });
    const role = x.role ?? 'agent';
    if (role === 'agent' ? u.role === 'client_lecteur' : !(role in RANG) || RANG[role] > RANG[u.role]) throw new ErreurOAuth('invalid_scope', `le rôle « ${role} » n'est pas autorisé pour votre compte (« ${u.role} »).`);
    const projets = x.projets ?? [];
    if (projets.length) { const ids = await this.acces.idsAccessibles(a); if (ids !== 'tous' && projets.some((p) => !ids.includes(p))) throw new ErreurOAuth('invalid_scope', 'projet hors de votre périmètre.'); }
    const code = randomBytes(32).toString('base64url');
    await this.codes.save(this.codes.create({ hache: hacher(code), client_id: x.client_id, utilisateur_id: u.id, redirect_uri: x.redirect_uri, code_challenge: x.code_challenge, role, projets,
      expire_le: new Date(Date.now() + 10 * 60 * 1000), utilise_le: null }));
    const r = new URL(x.redirect_uri); r.searchParams.set('code', code); if (x.state) r.searchParams.set('state', x.state);
    return { redirection: r.toString() };
  }

  refusUrl(redirect_uri: string, state?: string) { const r = new URL(redirect_uri); r.searchParams.set('error', 'access_denied'); if (state) r.searchParams.set('state', state); return r.toString(); }

  private async emettre(client: E.OAuthClient, u: E.Utilisateur, role: string, projets: string[]) {
    const g = genererJetonApi();
    const j = await this.jetons.save(this.jetons.create({ organisation_id: u.organisation_id, cree_par: u.id, utilisateur_id: u.id, nom: `OAuth · ${client.nom}`, prefixe: g.prefixe, hache: g.hache,
      projets, role: role as any, expire_le: new Date(Date.now() + DUREE_ACCES_S * 1000) }));
    const rt = randomBytes(32).toString('base64url');
    await this.rafraichissements.save(this.rafraichissements.create({ hache: hacher(rt), client_id: client.id, jeton_id: j.id, expire_le: new Date(Date.now() + DUREE_RAFRAICHISSEMENT_MS), revoque_le: null }));
    return { access_token: g.jeton, token_type: 'Bearer', expires_in: DUREE_ACCES_S, refresh_token: rt, scope: role };
  }

  async jeton(x: Record<string, string | undefined>) {
    if (x.grant_type === 'authorization_code') {
      if (!x.code || !x.code_verifier || !x.redirect_uri || !x.client_id) throw new ErreurOAuth('invalid_request', 'code, code_verifier, redirect_uri et client_id sont requis.');
      const c = await this.codes.findOneBy({ hache: hacher(x.code) });
      if (!c || c.utilise_le || c.expire_le < new Date()) throw new ErreurOAuth('invalid_grant', 'code invalide, expiré ou déjà utilisé.');
      await this.codes.update(c.id, { utilise_le: new Date() });
      if (c.client_id !== x.client_id || c.redirect_uri !== x.redirect_uri) throw new ErreurOAuth('invalid_grant', 'client_id ou redirect_uri ne correspondent pas.');
      if (createHash('sha256').update(x.code_verifier).digest('base64url') !== c.code_challenge) throw new ErreurOAuth('invalid_grant', 'code_verifier incorrect (PKCE).');
      const u = await this.utilisateurs.findOneBy({ id: c.utilisateur_id, actif: true });
      if (!u) throw new ErreurOAuth('invalid_grant', 'compte désactivé.');
      return this.emettre(await this.clients.findOneByOrFail({ id: c.client_id }), u, c.role, c.projets);
    }
    if (x.grant_type === 'refresh_token') {
      if (!x.refresh_token) throw new ErreurOAuth('invalid_request', 'refresh_token requis.');
      const r = await this.rafraichissements.findOneBy({ hache: hacher(x.refresh_token), revoque_le: IsNull() });
      if (!r || r.expire_le < new Date() || (x.client_id && x.client_id !== r.client_id)) throw new ErreurOAuth('invalid_grant', 'jeton de rafraîchissement invalide ou expiré.');
      const ancien = await this.jetons.findOneBy({ id: r.jeton_id });
      // Un jeton révoqué depuis Pilotage ne peut pas être ressuscité par rafraîchissement.
      if (!ancien || ancien.revoque_le) throw new ErreurOAuth('invalid_grant', 'accès révoqué depuis Pilotage.');
      const u = await this.utilisateurs.findOneBy({ id: ancien.utilisateur_id, actif: true });
      if (!u) throw new ErreurOAuth('invalid_grant', 'compte désactivé.');
      await this.rafraichissements.update(r.id, { revoque_le: new Date() });
      await this.jetons.update(ancien.id, { revoque_le: new Date() });
      return this.emettre(await this.clients.findOneByOrFail({ id: r.client_id }), u, ancien.role, ancien.projets);
    }
    throw new ErreurOAuth('unsupported_grant_type', 'grant_type attendu : authorization_code ou refresh_token.');
  }
}
