import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import * as E from '../db/entities';
import { Acteur } from '../common/acteur';
import { AccesService } from '../common/acces.service';
import { HistoriqueService } from '../common/historique.service';
import { conflit, introuvable, invalide, refuse } from '../common/erreurs';
import { seedCatalogue } from '../db/seed/catalogue';

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'equipe';

/** Équipes (organisations, espaces cloisonnés), membres et rôles ; création de projets et rôles par projet. */
@Injectable()
export class EquipesService {
  constructor(@InjectDataSource() private readonly db: DataSource, private readonly acces: AccesService, private readonly hist: HistoriqueService) {}
  private get em() { return this.db.manager; }

  private async moi(a: Acteur) {
    const u = await this.em.findOneBy(E.Utilisateur, { id: a.utilisateur_id });
    if (!u) throw introuvable('utilisateur');
    return u;
  }
  /** Rôle réel dans l'équipe (pour un jeton d'API : celui du développeur lié). */
  async roleEquipe(a: Acteur) { return a.jeton_id && a.role !== 'agent' ? (a.role as any) : (await this.moi(a)).role; }
  private async exigerAdmin(a: Acteur) { if ((await this.roleEquipe(a)) !== 'admin') throw refuse("seul un administrateur d'équipe peut faire cette opération."); }

  // ------------------------------------------------------------- équipes

  async mesEquipes(a: Acteur) {
    const moi = await this.moi(a);
    const rows: any[] = await this.em.query(`
      SELECT o.id, o.code, o.nom, u.role,
        (SELECT count(*)::int FROM utilisateur x WHERE x.organisation_id = o.id AND x.actif AND x.supprime_le IS NULL) nb_membres,
        (SELECT count(*)::int FROM projet p WHERE p.organisation_id = o.id AND p.supprime_le IS NULL) nb_projets
      FROM utilisateur u JOIN organisation o ON o.id = u.organisation_id
      WHERE lower(u.email) = lower($1) AND u.actif AND u.supprime_le IS NULL ORDER BY o.nom`, [moi.email]);
    return rows.map((r) => ({ ...r, courante: r.id === a.organisation_id }));
  }

  async creerEquipe(a: Acteur, nom: string) {
    if (a.role === 'agent') throw refuse("l'agent ne peut pas créer d'équipe.");
    const moi = await this.moi(a);
    return this.db.transaction(async (em) => {
      let code = slug(nom), n = 1;
      while (await em.findOneBy(E.Organisation, { code })) code = `${slug(nom)}-${++n}`;
      const org = await em.save(E.Organisation, em.create(E.Organisation, { code, nom: nom.trim() }));
      const u = await em.save(E.Utilisateur, em.create(E.Utilisateur, {
        organisation_id: org.id, email: moi.email, nom: moi.nom, role: 'admin', google_sub: moi.google_sub, photo_url: moi.photo_url, cree_par: moi.id,
      }));
      await seedCatalogue(em, org.id);
      await this.hist.tracer(em, { ...a, organisation_id: org.id, utilisateur_id: u.id }, 'organisation', null, { id: org.id, nom: org.nom, code });
      return { id: org.id, code, nom: org.nom, role: 'admin', courante: false, nb_membres: 1, nb_projets: 0 };
    });
  }

  async majEquipe(a: Acteur, nom: string) {
    await this.exigerAdmin(a);
    await this.em.update(E.Organisation, { id: a.organisation_id }, { nom: nom.trim() });
    return (await this.mesEquipes(a)).find((x) => x.courante)!;
  }

  // ------------------------------------------------------------- membres de l'équipe

  async membres(a: Acteur) {
    const rows: any[] = await this.em.query(`
      SELECT u.id, u.email, u.nom, u.role, u.actif, u.photo_url, u.derniere_connexion,
        (u.derniere_connexion IS NULL) invite,
        (SELECT count(*)::int FROM membre_projet m WHERE m.utilisateur_id = u.id AND m.supprime_le IS NULL) nb_projets
      FROM utilisateur u WHERE u.organisation_id = $1 AND u.supprime_le IS NULL ORDER BY u.actif DESC, u.nom`, [a.organisation_id]);
    return rows.map((r) => ({ ...r, moi: r.id === a.utilisateur_id }));
  }

  /** Invitation : crée le compte de la personne dans l'équipe ; elle se connecte ensuite avec Google (même adresse). */
  async inviter(a: Acteur, x: { email: string; nom?: string; role: string }) {
    await this.exigerAdmin(a);
    const email = x.email.trim().toLowerCase();
    const ex = await this.em.createQueryBuilder(E.Utilisateur, 'u').where('u.organisation_id = :o', { o: a.organisation_id }).andWhere('lower(u.email) = :e', { e: email }).getOne();
    if (ex?.actif) throw conflit(`${email} est déjà membre de l'équipe.`);
    const u = await this.db.transaction(async (em) => {
      const r = ex
        ? await em.save(E.Utilisateur, { ...ex, actif: true, role: x.role as any })
        : await em.save(E.Utilisateur, em.create(E.Utilisateur, { organisation_id: a.organisation_id, email, nom: x.nom?.trim() || email.split('@')[0], role: x.role as any, cree_par: a.utilisateur_id }));
      await this.hist.tracer(em, a, 'utilisateur', null, { id: r.id, email, role: x.role, invitation: true });
      return r;
    });
    const membre = (await this.membres(a)).find((m) => m.id === u.id)!;
    const web = (process.env.WEB_ORIGIN ?? 'http://localhost:4200').split(',')[0];
    return { membre, lien: `${web}/connexion?invitation=${encodeURIComponent(email)}`, message: `Envoyez ce lien à ${email} : la personne se connecte avec son compte Google (${email}).` };
  }

  async majMembre(a: Acteur, id: string, x: { role?: string; actif?: boolean }) {
    await this.exigerAdmin(a);
    const u = await this.em.findOneBy(E.Utilisateur, { id, organisation_id: a.organisation_id });
    if (!u) throw introuvable('membre');
    const devientNonAdmin = (x.role && x.role !== 'admin') || x.actif === false;
    if (u.role === 'admin' && devientNonAdmin) {
      const admins = await this.em.countBy(E.Utilisateur, { organisation_id: a.organisation_id, role: 'admin', actif: true });
      if (admins <= 1) throw refuse("l'équipe doit garder au moins un administrateur.");
    }
    await this.db.transaction(async (em) => {
      const avant = { id: u.id, role: u.role, actif: u.actif };
      if (x.role) u.role = x.role as any;
      if (x.actif != null) u.actif = x.actif;
      await em.save(u);
      if (x.actif === false) await em.query('UPDATE jeton_rafraichissement SET revoque_le = now() WHERE utilisateur_id = $1 AND revoque_le IS NULL', [u.id]);
      await this.hist.tracer(em, a, 'utilisateur', avant, { id: u.id, role: u.role, actif: u.actif });
    });
    return (await this.membres(a)).find((m) => m.id === id)!;
  }

  // ------------------------------------------------------------- projets

  async creerProjet(a: Acteur, x: { code: string; nom: string; client?: string; description?: string; date_debut?: string; date_livraison_prevue?: string; depots?: { nom: string; url?: string; stack?: string }[]; visibilite?: "equipe" | "equipe_lecture" | "membres" }) {
    const role = await this.roleEquipe(a);
    if (!['admin', 'chef_projet'].includes(role)) throw refuse('seul un administrateur ou un chef de projet peut créer un projet.');
    if (x.date_debut && x.date_livraison_prevue && x.date_livraison_prevue < x.date_debut) throw invalide('la livraison prévue précède le début.');
    return this.db.transaction(async (em) => {
      if (await em.findOneBy(E.Projet, { organisation_id: a.organisation_id, code: x.code })) throw conflit(`le code « ${x.code} » est déjà utilisé dans l'équipe.`);
      const moi = await em.findOneByOrFail(E.Utilisateur, { id: a.utilisateur_id });
      const base = { organisation_id: a.organisation_id, cree_par: a.utilisateur_id };
      const p = await em.save(E.Projet, em.create(E.Projet, { ...base, code: x.code, nom: x.nom.trim(), client: x.client?.trim() ?? '', description: x.description ?? '',
        date_debut: x.date_debut ?? null, date_livraison_prevue: x.date_livraison_prevue ?? null, chef_projet_id: moi.id, chef_projet: moi.nom, statut: 'en_cours', visibilite: x.visibilite ?? 'equipe' }));
      const P = { ...base, projet_id: p.id };
      for (const [ordre, d] of (x.depots ?? []).entries()) await em.save(E.Depot, em.create(E.Depot, { ...P, nom: d.nom, url: d.url ?? '', stack: d.stack ?? '', ordre }));
      // Un document « à produire » par type du catalogue (documentsInitiaux() du kit v1).
      const types = await em.find(E.TypeDocument, { where: { organisation_id: a.organisation_id }, order: { ordre: 'ASC' } });
      for (const [ordre, t] of types.entries()) await em.insert(E.Document, { ...P, type_document_id: t.id, code: t.code, statut: 'a_produire', ordre });
      await em.insert(E.MembreProjet, { ...P, utilisateur_id: moi.id, role: 'chef_projet' });
      await this.hist.tracer(em, a, 'projet', null, { id: p.id, code: p.code, nom: p.nom }, { projet_id: p.id });
      return { id: p.id, code: p.code, nom: p.nom, nb_documents: types.length };
    });
  }

  async membresProjet(a: Acteur, code: string) {
    const p = await this.acces.projet(a, code);
    return this.em.query(`SELECT u.id utilisateur_id, u.email, u.nom, u.photo_url, u.role role_equipe, m.role, u.actif
      FROM membre_projet m JOIN utilisateur u ON u.id = m.utilisateur_id WHERE m.projet_id = $1 AND m.supprime_le IS NULL ORDER BY m.role, u.nom`, [p.id]);
  }

  private async exigerChefProjet(a: Acteur, code: string) {
    if (a.role === 'agent') throw refuse("l'agent ne peut pas gérer les membres d'un projet.");
    const p = await this.acces.projet(a, code);
    await this.acces.exigerChefProjet(a, p, 'gérer les membres et la visibilité du projet');
    return p;
  }

  /** Visibilité du projet dans l'équipe (chef de projet ou administrateur, humain). */
  async majVisibilite(a: Acteur, code: string, visibilite: 'equipe' | 'equipe_lecture' | 'membres') {
    if (a.role === 'agent') throw refuse("l'agent ne peut pas changer la visibilité d'un projet.");
    const p = await this.exigerChefProjet(a, code);
    await this.db.transaction(async (em: EntityManager) => {
      await em.update(E.Projet, { id: p.id }, { visibilite });
      await this.hist.tracer(em, a, 'projet', { id: p.id, visibilite: p.visibilite }, { id: p.id, visibilite }, { projet_id: p.id });
    });
    return { code: p.code, visibilite };
  }

  async definirMembreProjet(a: Acteur, code: string, utilisateur_id: string, role: string) {
    const p = await this.exigerChefProjet(a, code);
    const u = await this.em.findOneBy(E.Utilisateur, { id: utilisateur_id, organisation_id: a.organisation_id, actif: true });
    if (!u) throw introuvable('membre de l’équipe');
    await this.db.transaction(async (em: EntityManager) => {
      const ex = await em.findOneBy(E.MembreProjet, { projet_id: p.id, utilisateur_id });
      if (ex) { await em.update(E.MembreProjet, { id: ex.id }, { role: role as any }); }
      else await em.insert(E.MembreProjet, { organisation_id: a.organisation_id, projet_id: p.id, utilisateur_id, role: role as any, cree_par: a.utilisateur_id });
      await this.hist.tracer(em, a, 'membre_projet', ex ? { id: utilisateur_id, role: ex.role } : null, { id: utilisateur_id, role }, { projet_id: p.id });
    });
    return this.membresProjet(a, code);
  }

  async retirerMembreProjet(a: Acteur, code: string, utilisateur_id: string) {
    const p = await this.exigerChefProjet(a, code);
    const chefs = await this.em.countBy(E.MembreProjet, { projet_id: p.id, role: 'chef_projet' });
    const cible = await this.em.findOneBy(E.MembreProjet, { projet_id: p.id, utilisateur_id });
    if (!cible) throw introuvable('membre du projet');
    if (cible.role === 'chef_projet' && chefs <= 1) throw refuse('le projet doit garder au moins un chef de projet.');
    await this.db.transaction(async (em) => {
      await em.delete(E.MembreProjet, { id: cible.id });
      await this.hist.tracer(em, a, 'membre_projet', { id: utilisateur_id, role: cible.role }, { id: utilisateur_id, role: null }, { projet_id: p.id });
    });
    return this.membresProjet(a, code);
  }
}
