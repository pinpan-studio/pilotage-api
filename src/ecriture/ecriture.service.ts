import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import * as E from '../db/entities';
import { Acteur } from '../common/acteur';
import { AccesService } from '../common/acces.service';
import { HistoriqueService } from '../common/historique.service';
import { introuvable, invalide, refuse } from '../common/erreurs';
import { ReglesAgent } from '../common/regles-agent';
import { IndicateursService } from '../indicateurs/indicateurs.service';
import { STATUTS_DEPOT, STATUTS_DOCUMENT, STATUTS_FONCTIONNALITE, STATUTS_RETOUR, STATUTS_ACTION } from '../indicateurs/referentiels';

const RE_REF_F = /^F-\d{2,4}$/;
const plain = (o: any) => JSON.parse(JSON.stringify(o));

/** Écritures métier communes à l'API REST et au serveur MCP. Toutes tracées dans « historique ». */
@Injectable()
export class EcritureService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly acces: AccesService,
    private readonly hist: HistoriqueService,
    private readonly ind: IndicateursService,
  ) {}

  /** Exécute fn dans une transaction verrouillée par projet (attribution sûre des références). */
  private async tx<T>(projet: E.Projet, fn: (em: EntityManager) => Promise<T>) {
    return this.db.transaction(async (em) => {
      await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [projet.id]);
      return fn(em);
    });
  }

  /** Prochaine référence libre (logique prochainId du kit : max + 1, sur 3 chiffres). */
  async prochaineRef(em: EntityManager, table: string, projet_id: string, prefixe: string) {
    const r = await em.query(`SELECT ref FROM "${table}" WHERE projet_id = $1`, [projet_id]);
    const max = r.reduce((m: number, x: any) => { const n = Number(String(x.ref).split('-')[1]); return Number.isFinite(n) && n > m ? n : m; }, 0);
    return `${prefixe}-${String(max + 1).padStart(3, '0')}`;
  }

  private async ecrireProjet(a: Acteur, code: string) {
    const p = await this.acces.projet(a, code);
    await this.acces.exigerEcriture(a, p);
    return p;
  }

  // ------------------------------------------------------------- sessions de développement

  async demarrerSession(a: Acteur, code: string, depot?: string, session_externe = '') {
    const p = await this.ecrireProjet(a, code);
    const d = depot ? await this.db.manager.findOneBy(E.Depot, { projet_id: p.id, nom: depot }) : null;
    if (depot && !d) throw introuvable(`dépôt « ${depot} » dans le projet ${code}`);
    const s = await this.db.manager.save(E.SessionDev, this.db.manager.create(E.SessionDev, {
      organisation_id: p.organisation_id, projet_id: p.id, cree_par: a.utilisateur_id, depot_id: d?.id ?? null,
      utilisateur_id: a.utilisateur_id, auteur: a.nom, debut: new Date(), session_externe,
    }));
    return { session: s, projet: p };
  }

  private async session(a: Acteur, session_id: string) {
    const s = await this.db.manager.findOneBy(E.SessionDev, { id: session_id, organisation_id: a.organisation_id });
    if (!s) throw introuvable(`session ${session_id}`);
    const projets = await this.acces.idsAccessibles(a);
    if (projets !== 'tous' && !projets.includes(s.projet_id)) throw introuvable(`session ${session_id}`);
    if (a.role === 'agent' && s.utilisateur_id !== a.utilisateur_id) throw refuse("cette session appartient à un autre développeur.");
    return s;
  }

  async ajouterNoteSession(a: Acteur, session_id: string, texte: string, fonctionnalites: string[] = []) {
    const s = await this.session(a, session_id);
    if (s.fin) throw invalide('la session est clôturée.');
    const note = { ts: new Date().toISOString(), texte, fonctionnalites };
    await this.db.manager.query(`UPDATE session_dev SET notes = notes || $2::jsonb, fonctionnalites = ARRAY(SELECT DISTINCT unnest(fonctionnalites || $3::text[])), modifie_le = now() WHERE id = $1`,
      [s.id, JSON.stringify([note]), fonctionnalites]);
    return { ...note, nb_notes: s.notes.length + 1 };
  }

  async cloturerSession(a: Acteur, session_id: string, resume_md: string) {
    const s = await this.session(a, session_id);
    await this.db.transaction(async (em) => {
      const avant = plain(s);
      s.fin = new Date(); s.resume = resume_md;
      await em.save(s);
      await this.hist.tracer(em, a, 'session_dev', avant, plain(s), { session_id: s.id });
    });
    return s;
  }

  // ------------------------------------------------------------- fonctionnalités

  /** Tous les cas de test de la fonctionnalité sont OK (résultat de la dernière campagne qui les a exécutés). */
  async testsTousOk(p: E.Projet, ref: string) {
    const { indicateurs: m, modele } = await this.ind.calculer(p);
    const tests = modele.tests.filter((t: any) => t.fonctionnalite === ref);
    return tests.length > 0 && tests.every((t: any) => m.resultatTest[t.id]?.resultat === 'ok');
  }

  async majStatutFonctionnalite(a: Acteur, code: string, ref: string, statut: string, opts: { depot?: string; notes?: string; session_id?: string } = {}) {
    const p = await this.ecrireProjet(a, code);
    const f = await this.db.manager.findOneBy(E.Fonctionnalite, { projet_id: p.id, ref });
    if (!f) throw introuvable(`fonctionnalité ${ref}`);
    if (opts.depot) {
      if (!STATUTS_DEPOT.includes(statut)) throw invalide(`statut de dépôt « ${statut} » (attendu : ${STATUTS_DEPOT.join(', ')}).`);
      const d = await this.db.manager.findOneBy(E.Depot, { projet_id: p.id, nom: opts.depot });
      if (!d) throw introuvable(`dépôt « ${opts.depot} »`);
      return this.tx(p, async (em) => {
        const ex = await em.findOneBy(E.FonctionnaliteDepot, { fonctionnalite_id: f.id, depot_id: d.id });
        await em.save(E.FonctionnaliteDepot, { fonctionnalite_id: f.id, depot_id: d.id, statut: statut as any });
        await this.hist.tracer(em, a, 'fonctionnalite_depot', { id: f.id, [`depot:${d.nom}`]: ex?.statut ?? null }, { id: f.id, [`depot:${d.nom}`]: statut }, { projet_id: p.id, session_id: opts.session_id });
        if (opts.notes != null) await this.majNotes(em, a, f, opts.notes, opts.session_id);
        return { ref, depot: d.nom, statut };
      });
    }
    if (!STATUTS_FONCTIONNALITE.includes(statut)) throw invalide(`statut « ${statut} » (attendu : ${STATUTS_FONCTIONNALITE.join(', ')}).`);
    if (statut === 'valide' && a.role !== 'agent') await this.acces.exigerChefProjet(a, p, 'valider une fonctionnalité');
    ReglesAgent.statutFonctionnalite(a, statut, statut === 'recette' ? await this.testsTousOk(p, ref) : true);
    return this.tx(p, async (em) => {
      const avant = plain(f);
      f.statut = statut;
      if (opts.notes != null) f.notes = opts.notes;
      await em.save(f);
      await this.hist.tracer(em, a, 'fonctionnalite', avant, plain(f), { session_id: opts.session_id });
      return { ref, statut };
    });
  }

  private async majNotes(em: EntityManager, a: Acteur, f: E.Fonctionnalite, notes: string, session_id?: string) {
    const avant = plain(f); f.notes = notes; await em.save(f);
    await this.hist.tracer(em, a, 'fonctionnalite', avant, plain(f), { session_id });
  }

  // ------------------------------------------------------------- documents

  private async documentDe(em: EntityManager, p: E.Projet, code: string) {
    const d = await em.findOneBy(E.Document, { projet_id: p.id, code });
    if (!d) throw introuvable(`document ${code} dans le projet ${p.code}`);
    const t = d.type_document_id ? await em.findOneBy(E.TypeDocument, { id: d.type_document_id }) : null;
    return { d, t };
  }

  static versionSuivante(v: string | undefined) {
    if (!v) return '0.1';
    const [maj, min] = v.split('.').map((x) => Number(x) || 0);
    return `${maj}.${min + 1}`;
  }

  /** Nouvelle version du contenu. Statut cible : en_cours (défaut) ou en_revue ; une version figée repasse en_revue. */
  async ecrireDocument(a: Acteur, code: string, codeDoc: string, contenu: string, resume_modif: string, opts: { statut?: string; session_id?: string } = {}) {
    const p = await this.ecrireProjet(a, code);
    const statutCible = opts.statut ?? 'en_cours';
    if (!['en_cours', 'en_revue'].includes(statutCible)) throw refuse("une écriture de contenu ne peut mettre le document qu'à « en_cours » ou « en_revue » ; la validation et la signature passent par le circuit du chef de projet.");
    return this.tx(p, async (em) => {
      const { d, t } = await this.documentDe(em, p, codeDoc);
      ReglesAgent.documentProducteur(a, t?.producteur ?? 'mixte');
      if (d.statut === 'sans_objet') throw invalide(`le document ${codeDoc} est « sans objet » pour ce projet.`);
      const derniere = await em.findOne(E.VersionDocument, { where: { document_id: d.id }, order: { cree_le: 'DESC' } });
      const numero = EcritureService.versionSuivante(derniere?.numero || d.version);
      const v = await em.save(E.VersionDocument, em.create(E.VersionDocument, {
        organisation_id: p.organisation_id, cree_par: a.utilisateur_id, document_id: d.id, numero, contenu, resume_modif,
        auteur_type: a.auteur_type, auteur_id: a.utilisateur_id, session_id: opts.session_id ?? null,
      }));
      const avant = plain(d);
      const etaitFige = ['valide', 'signe'].includes(d.statut);
      d.statut = etaitFige ? 'en_revue' : statutCible;
      d.version = numero;
      await em.save(d);
      await this.hist.tracer(em, a, 'document', avant, plain(d), { session_id: opts.session_id });
      return { code: codeDoc, version: numero, statut: d.statut, version_id: v.id, repasse_en_revue: etaitFige };
    });
  }

  /** Circuit de validation. L'agent ne dépasse jamais en_revue ; valider/signer : chef de projet ; signer : scan obligatoire. */
  async majStatutDocument(a: Acteur, code: string, codeDoc: string, statut: string, session_id?: string) {
    if (!STATUTS_DOCUMENT.includes(statut)) throw invalide(`statut de document « ${statut} » (attendu : ${STATUTS_DOCUMENT.join(', ')}).`);
    ReglesAgent.statutDocument(a, statut);
    const p = await this.ecrireProjet(a, code);
    if (['valide', 'signe'].includes(statut)) await this.acces.exigerChefProjet(a, p, `passer un document à « ${statut} »`);
    return this.tx(p, async (em) => {
      const { d, t } = await this.documentDe(em, p, codeDoc);
      if (statut === 'signe') {
        const scans = await em.countBy(E.Fichier, { document_id: d.id, categorie: 'scan_signe' });
        if (!scans) throw refuse('la signature exige un scan signé téléversé (catégorie « scan_signe »).');
      }
      const avant = plain(d);
      d.statut = statut;
      if (['valide', 'signe'].includes(statut)) {
        d.date_validation = new Date().toISOString().slice(0, 10);
        const derniere = await em.findOne(E.VersionDocument, { where: { document_id: d.id }, order: { cree_le: 'DESC' } });
        if (derniere) { derniere.figee = true; await em.save(derniere); }
      }
      await em.save(d);
      await this.hist.tracer(em, a, 'document', avant, plain(d), { session_id });
      return { code: codeDoc, titre: t?.titre ?? d.titre, statut };
    });
  }

  // ------------------------------------------------------------- documentation technique

  async ecrireDocTechnique(a: Acteur, code: string, depot: string | undefined, chemin: string, contenu: string, session_id?: string) {
    const p = await this.ecrireProjet(a, code);
    if (!chemin || chemin.includes('..') || chemin.startsWith('/')) throw invalide(`chemin « ${chemin} »`);
    return this.tx(p, async (em) => {
      const d = depot ? await em.findOneBy(E.Depot, { projet_id: p.id, nom: depot }) : null;
      if (depot && !d) throw introuvable(`dépôt « ${depot} »`);
      const complet = d && !chemin.startsWith(`${d.nom}/`) ? `${d.nom}/${chemin}` : chemin;
      let doc = await em.findOneBy(E.DocTechnique, { projet_id: p.id, chemin: complet });
      const avant = doc ? plain(doc) : null;
      doc = await em.save(E.DocTechnique, em.create(E.DocTechnique, {
        ...(doc ?? { organisation_id: p.organisation_id, projet_id: p.id, cree_par: a.utilisateur_id }),
        depot_id: d?.id ?? doc?.depot_id ?? null, chemin: complet, titre: (contenu.match(/^# (.+)$/m) || [])[1] || complet, contenu,
      }));
      await this.hist.tracer(em, a, 'doc_technique', avant, plain(doc), { session_id });
      return { chemin: complet, cree: !avant };
    });
  }

  // ------------------------------------------------------------- registres

  async creerRetour(a: Acteur, code: string, x: { date?: string; source?: string; contact_client?: string; type?: string; priorite?: string; retour_md: string; fonctionnalites?: string[] }, session_id?: string) {
    const p = await this.ecrireProjet(a, code);
    return this.tx(p, async (em) => {
      const ref = await this.prochaineRef(em, 'retour_client', p.id, 'RC');
      const foncs = await this.foncs(em, p, x.fonctionnalites ?? []);
      const r = await em.save(E.RetourClient, em.create(E.RetourClient, {
        organisation_id: p.organisation_id, projet_id: p.id, cree_par: a.utilisateur_id, ref,
        date: x.date ?? new Date().toISOString().slice(0, 10), source: x.source ?? '', contact_client: x.contact_client ?? '',
        saisi_par: a.nom, type: x.type ?? 'remarque', priorite: x.priorite ?? 'moyenne', statut: 'nouveau', retour: x.retour_md,
        contenu: `## Retour du client\n\n${x.retour_md}\n\n## Analyse\n\n## Action / réponse apportée\n`,
      }));
      for (const f of foncs) await em.insert(E.RetourFonctionnalite, { retour_id: r.id, fonctionnalite_id: f.id });
      await this.hist.tracer(em, a, 'retour_client', null, plain(r), { session_id });
      return r;
    });
  }

  async majRetour(a: Acteur, code: string, ref: string, statut: string, action_md?: string, session_id?: string) {
    if (!STATUTS_RETOUR.includes(statut)) throw invalide(`statut « ${statut} »`);
    const p = await this.ecrireProjet(a, code);
    return this.tx(p, async (em) => {
      const r = await em.findOneBy(E.RetourClient, { projet_id: p.id, ref });
      if (!r) throw introuvable(`retour ${ref}`);
      const avant = plain(r);
      r.statut = statut;
      if (action_md != null) r.action = action_md;
      if (statut === 'resolu' && !r.date_resolution) r.date_resolution = new Date().toISOString().slice(0, 10);
      await em.save(r);
      await this.hist.tracer(em, a, 'retour_client', avant, plain(r), { session_id });
      return r;
    });
  }

  private async foncs(em: EntityManager, p: E.Projet, refs: string[]) {
    const res: E.Fonctionnalite[] = [];
    for (const ref of refs) {
      if (!RE_REF_F.test(ref)) throw invalide(`référence de fonctionnalité « ${ref} »`);
      const f = await em.findOneBy(E.Fonctionnalite, { projet_id: p.id, ref });
      if (!f) throw introuvable(`fonctionnalité ${ref}`);
      res.push(f);
    }
    return res;
  }

  async ajouterRisque(a: Acteur, code: string, x: { titre: string; categorie?: string; probabilite: number; impact: number; parade?: string; responsable?: string }, session_id?: string) {
    const p = await this.ecrireProjet(a, code);
    for (const k of ['probabilite', 'impact'] as const) if (!(x[k] >= 1 && x[k] <= 4)) throw invalide(`${k} doit être entre 1 et 4.`);
    return this.tx(p, async (em) => {
      const ref = await this.prochaineRef(em, 'risque', p.id, 'R');
      const r = await em.save(E.Risque, em.create(E.Risque, {
        organisation_id: p.organisation_id, projet_id: p.id, cree_par: a.utilisateur_id, ref, titre: x.titre, categorie: x.categorie ?? '',
        probabilite: x.probabilite, impact: x.impact, parade: x.parade ?? '', responsable: x.responsable ?? '', date: new Date().toISOString().slice(0, 10), statut: 'ouvert',
      }));
      await this.hist.tracer(em, a, 'risque', null, plain(r), { session_id });
      return r;
    });
  }

  async ajouterAction(a: Acteur, code: string, x: { action: string; responsable?: string; echeance?: string; origine_type?: string; origine_id?: string }, session_id?: string) {
    const p = await this.ecrireProjet(a, code);
    if (x.echeance && !/^\d{4}-\d{2}-\d{2}$/.test(x.echeance)) throw invalide('échéance au format AAAA-MM-JJ.');
    return this.tx(p, async (em) => {
      const ref = await this.prochaineRef(em, 'action', p.id, 'A');
      const r = await em.save(E.Action, em.create(E.Action, {
        organisation_id: p.organisation_id, projet_id: p.id, cree_par: a.utilisateur_id, ref, action: x.action, responsable: x.responsable ?? '',
        echeance: x.echeance ?? null, statut: 'a_faire', origine_type: x.origine_type ?? (session_id ? 'session' : ''), origine_id: x.origine_id ?? session_id ?? '',
      }));
      await this.hist.tracer(em, a, 'action', null, plain(r), { session_id });
      return r;
    });
  }

  async majAction(a: Acteur, code: string, ref: string, statut: string, session_id?: string) {
    if (!STATUTS_ACTION.includes(statut)) throw invalide(`statut « ${statut} »`);
    const p = await this.ecrireProjet(a, code);
    return this.tx(p, async (em) => {
      const r = await em.findOneBy(E.Action, { projet_id: p.id, ref });
      if (!r) throw introuvable(`action ${ref}`);
      const avant = plain(r); r.statut = statut as any; await em.save(r);
      await this.hist.tracer(em, a, 'action', avant, plain(r), { session_id });
      return r;
    });
  }
}
