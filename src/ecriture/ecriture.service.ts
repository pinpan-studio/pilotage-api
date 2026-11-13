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
    // Règle métier pour tous : « recette » exige des tests tous OK, sauf décision du chef de projet.
    if (statut === 'recette' && a.role !== 'agent' && (await this.acces.roleSurProjet(a, p)) !== 'chef_projet' && !(await this.testsTousOk(p, ref)))
      throw refuse('passage en recette impossible : tous les cas de test de la fonctionnalité doivent être OK dans la dernière campagne (seul un chef de projet peut passer outre).');
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
      // La nouvelle version n'est pas validée : la date de validation de l'ancienne ne s'applique plus.
      if (etaitFige) d.date_validation = null;
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
    return this.modifierAction(a, code, ref, { statut }, session_id);
  }

  /** Modifie une tâche du plan d'actions (statut, libellé, responsable, échéance). */
  async modifierAction(a: Acteur, code: string, ref: string, x: { statut?: string; action?: string; responsable?: string; echeance?: string | null }, session_id?: string) {
    if (x.statut != null && !STATUTS_ACTION.includes(x.statut)) throw invalide(`statut « ${x.statut} »`);
    if (x.echeance && !/^\d{4}-\d{2}-\d{2}$/.test(x.echeance)) throw invalide('échéance au format AAAA-MM-JJ.');
    if (x.action != null && !x.action.trim()) throw invalide('le libellé de la tâche est vide.');
    const p = await this.ecrireProjet(a, code);
    return this.tx(p, async (em) => {
      const r = await em.findOneBy(E.Action, { projet_id: p.id, ref });
      if (!r) throw introuvable(`action ${ref}`);
      const avant = plain(r);
      if (x.statut != null) r.statut = x.statut as any;
      if (x.action != null) r.action = x.action.trim();
      if (x.responsable != null) r.responsable = x.responsable.trim();
      if (x.echeance !== undefined) r.echeance = x.echeance || null;
      await em.save(r);
      await this.hist.tracer(em, a, 'action', avant, plain(r), { session_id });
      return r;
    });
  }

  // ------------------------------------------------------------- fonctionnalités, ADR, changelog

  async creerFonctionnalite(a: Acteur, code: string, x: { titre: string; exigences?: string[]; lot?: string; poids?: number; origine?: string; depots?: string[]; description?: string }, session_id?: string) {
    const p = await this.ecrireProjet(a, code);
    const origine = x.origine ?? 'interne';
    if (a.role === 'agent' && !(origine === 'interne' || /^DC-\d{2,4}$/.test(origine)))
      throw refuse("l'agent ne peut créer qu'une fonctionnalité d'origine « interne » ou issue d'une demande de changement (DC-xxx).");
    if (x.poids != null && ![1, 2, 3, 5, 8].includes(x.poids)) throw invalide('poids attendu : 1, 2, 3, 5 ou 8.');
    return this.tx(p, async (em) => {
      if (/^DC-/.test(origine) && !(await em.findOneBy(E.Changement, { projet_id: p.id, ref: origine, decision: 'accepte' })))
        throw refuse(`la demande de changement ${origine} n'existe pas ou n'est pas acceptée.`);
      const ref = await this.prochaineRef(em, 'fonctionnalite', p.id, 'F');
      const ordre = Number((await em.query('SELECT coalesce(max(ordre), -1) + 1 n FROM fonctionnalite WHERE projet_id = $1', [p.id]))[0].n);
      const f = await em.save(E.Fonctionnalite, em.create(E.Fonctionnalite, {
        organisation_id: p.organisation_id, projet_id: p.id, cree_par: a.utilisateur_id, ref, titre: x.titre, jalon: x.lot ?? '',
        poids: x.poids ?? 1, statut: 'a_faire', origine, ordre, description: x.description ?? '',
      }));
      for (const e of x.exigences ?? []) {
        const ex = await em.findOneBy(E.Exigence, { projet_id: p.id, ref: e });
        if (!ex) throw introuvable(`exigence ${e}`);
        await em.insert(E.FonctionnaliteExigence, { fonctionnalite_id: f.id, exigence_id: ex.id });
      }
      for (const nom of x.depots ?? []) {
        const d = await em.findOneBy(E.Depot, { projet_id: p.id, nom });
        if (!d) throw introuvable(`dépôt « ${nom} »`);
        await em.insert(E.FonctionnaliteDepot, { fonctionnalite_id: f.id, depot_id: d.id, statut: 'a_faire' });
      }
      await this.hist.tracer(em, a, 'fonctionnalite', null, plain(f), { session_id });
      return f;
    });
  }

  async ajouterAdr(a: Acteur, code: string, x: { titre: string; contexte: string; decision: string; consequences?: string; alternatives?: string; depots?: string[]; fonctionnalites?: string[] }, session_id?: string) {
    const p = await this.ecrireProjet(a, code);
    return this.tx(p, async (em) => {
      const ref = await this.prochaineRef(em, 'adr', p.id, 'ADR');
      const date = new Date().toISOString().slice(0, 10);
      const contenu = `# ${ref} — ${x.titre}\n\n## Contexte\n${x.contexte}\n\n## Décision\n${x.decision}\n\n## Conséquences\n${x.consequences ?? ''}\n\n## Alternatives écartées\n${x.alternatives ?? ''}\n`;
      const r = await em.save(E.Adr, em.create(E.Adr, {
        organisation_id: p.organisation_id, projet_id: p.id, cree_par: a.utilisateur_id, ref, titre: x.titre, date, statut: 'proposee',
        depots: x.depots ?? [], fonctionnalites: x.fonctionnalites ?? [], contexte: x.contexte, decision: x.decision,
        consequences: x.consequences ?? '', alternatives: x.alternatives ?? '', contenu,
      }));
      await this.hist.tracer(em, a, 'adr', null, plain(r), { session_id });
      return r;
    });
  }

  async ajouterEntreeChangelog(a: Acteur, code: string, x: { type: 'ajoute' | 'modifie' | 'corrige' | 'retire'; texte: string; fonctionnalite?: string; version?: string }, session_id?: string) {
    const p = await this.ecrireProjet(a, code);
    if (!['ajoute', 'modifie', 'corrige', 'retire'].includes(x.type)) throw invalide('type attendu : ajoute, modifie, corrige ou retire.');
    return this.tx(p, async (em) => {
      const f = x.fonctionnalite ? (await this.foncs(em, p, [x.fonctionnalite]))[0] : null;
      const ordre = Number((await em.query('SELECT coalesce(min(ordre), 1) - 1 n FROM changelog_entree WHERE projet_id = $1', [p.id]))[0].n);
      const r = await em.save(E.ChangelogEntree, em.create(E.ChangelogEntree, {
        organisation_id: p.organisation_id, projet_id: p.id, cree_par: a.utilisateur_id, version: x.version ?? 'Non publié',
        date: null, type: x.type, texte: x.texte, fonctionnalite_id: f?.id ?? null, ordre,
      }));
      await this.hist.tracer(em, a, 'changelog_entree', null, plain(r), { session_id });
      return r;
    });
  }

  // ------------------------------------------------------------- recette, changements, comptes rendus

  async creerCasTest(a: Acteur, code: string, x: { fonctionnalite?: string; titre: string; preconditions?: string; etapes?: string[]; attendu?: string }, session_id?: string) {
    const p = await this.ecrireProjet(a, code);
    return this.tx(p, async (em) => {
      let fid: string | null = null;
      if (x.fonctionnalite) { const f = await em.findOneBy(E.Fonctionnalite, { projet_id: p.id, ref: x.fonctionnalite }); if (!f) throw introuvable(`fonctionnalité ${x.fonctionnalite}`); fid = f.id; }
      const ref = await this.prochaineRef(em, 'cas_test', p.id, 'RT');
      const ordre = Number((await em.query('SELECT coalesce(max(ordre), -1) + 1 n FROM cas_test WHERE projet_id = $1', [p.id]))[0].n);
      const c = await em.save(E.CasTest, em.create(E.CasTest, { organisation_id: p.organisation_id, projet_id: p.id, cree_par: a.utilisateur_id, ref, fonctionnalite_id: fid,
        titre: x.titre, preconditions: x.preconditions ?? '', etapes: x.etapes ?? [], attendu: x.attendu ?? '', ordre }));
      await this.hist.tracer(em, a, 'cas_test', null, plain(c), { session_id });
      return c;
    });
  }

  /** Enregistre des résultats dans une campagne (créée si la référence est inconnue). */
  async enregistrerResultats(a: Acteur, code: string, x: { campagne: string; titre?: string; type?: 'interne' | 'client'; date?: string; environnement?: string; resultats: { cas_test: string; resultat: 'ok' | 'ko' | 'reserve' | 'non_teste'; commentaire?: string }[] }, session_id?: string) {
    const p = await this.ecrireProjet(a, code);
    if (x.date && !/^\d{4}-\d{2}-\d{2}$/.test(x.date)) throw invalide('date au format AAAA-MM-JJ.');
    if (a.role === 'agent' && x.type === 'client') throw refuse("l'agent ne peut pas saisir une campagne de recette client (réservée aux humains).");
    return this.tx(p, async (em) => {
      let camp = await em.findOneBy(E.Campagne, { projet_id: p.id, ref: x.campagne });
      if (camp && a.role === 'agent' && camp.type === 'client') throw refuse("l'agent ne peut pas saisir de résultats dans une campagne de recette client.");
      if (!camp) {
        camp = await em.save(E.Campagne, em.create(E.Campagne, { organisation_id: p.organisation_id, projet_id: p.id, cree_par: a.utilisateur_id, ref: x.campagne,
          titre: x.titre ?? x.campagne, type: x.type ?? 'interne', date: x.date ?? new Date().toISOString().slice(0, 10), environnement: x.environnement ?? '', testeurs: [a.nom] }));
        await this.hist.tracer(em, a, 'campagne', null, plain(camp), { session_id });
      }
      const bilan = { ok: 0, ko: 0, reserve: 0, non_teste: 0 } as Record<string, number>;
      for (const r of x.resultats) {
        const ct = await em.findOneBy(E.CasTest, { projet_id: p.id, ref: r.cas_test });
        if (!ct) throw introuvable(`cas de test ${r.cas_test}`);
        const avant = await em.findOneBy(E.ResultatTest, { campagne_id: camp.id, cas_test_id: ct.id });
        const v = { organisation_id: p.organisation_id, campagne_id: camp.id, cas_test_id: ct.id, resultat: r.resultat, commentaire: r.commentaire ?? '' };
        const apres = avant ? await em.save(E.ResultatTest, { ...avant, ...v }) : await em.save(E.ResultatTest, em.create(E.ResultatTest, v));
        await this.hist.tracer(em, a, 'resultat_test', avant ? plain(avant) : null, plain(apres), { session_id });
        bilan[r.resultat]++;
      }
      return { campagne: camp.ref, bilan };
    });
  }

  async proposerChangement(a: Acteur, code: string, x: { titre: string; description?: string; demandeur?: string; origine?: string; impact_delai_jours?: number; impact_cout?: string; fonctionnalites?: string[] }, session_id?: string, em0?: EntityManager) {
    const p = await this.ecrireProjet(a, code);
    const faire = async (em: EntityManager) => {
      const ref = await this.prochaineRef(em, 'changement', p.id, 'DC');
      const c = await em.save(E.Changement, em.create(E.Changement, { organisation_id: p.organisation_id, projet_id: p.id, cree_par: a.utilisateur_id, ref, titre: x.titre,
        description: x.description ?? '', demandeur: x.demandeur ?? '', origine: x.origine ?? '', impact_delai_jours: x.impact_delai_jours ?? 0, impact_cout: x.impact_cout ?? '',
        date: new Date().toISOString().slice(0, 10), decision: 'en_analyse' }));
      for (const fr of x.fonctionnalites ?? []) {
        const f = await em.findOneBy(E.Fonctionnalite, { projet_id: p.id, ref: fr }); if (!f) throw introuvable(`fonctionnalité ${fr}`);
        await em.insert(E.ChangementFonctionnalite, { changement_id: c.id, fonctionnalite_id: f.id });
      }
      await this.hist.tracer(em, a, 'changement', null, plain(c), { session_id });
      return c;
    };
    return em0 ? faire(em0) : this.tx(p, faire);
  }

  /** Crée un compte rendu et alimente, dans la même transaction, actions, risques et demandes de changement. */
  async creerCompteRendu(a: Acteur, code: string, x: { type?: string; date: string; titre?: string; lieu?: string; participants?: string[]; contenu_md: string;
    actions?: { action: string; responsable?: string; echeance?: string }[]; risques?: { titre: string; probabilite: number; impact: number; categorie?: string; parade?: string; responsable?: string }[];
    decisions?: string[]; changements?: { titre: string; description?: string; demandeur?: string; fonctionnalites?: string[] }[] }, session_id?: string) {
    const p = await this.ecrireProjet(a, code);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date)) throw invalide('date au format AAAA-MM-JJ.');
    for (const r of x.risques ?? []) for (const k of ['probabilite', 'impact'] as const) if (!(r[k] >= 1 && r[k] <= 4)) throw invalide(`${k} doit être entre 1 et 4.`);
    for (const t of x.actions ?? []) if (t.echeance && !/^\d{4}-\d{2}-\d{2}$/.test(t.echeance)) throw invalide('échéance au format AAAA-MM-JJ.');
    return this.tx(p, async (em) => {
      const contenu = x.contenu_md + (x.decisions?.length ? `\n\n## Décisions\n${x.decisions.map((d) => `- ${d}`).join('\n')}` : '');
      const reu = await em.save(E.Reunion, em.create(E.Reunion, { organisation_id: p.organisation_id, projet_id: p.id, cree_par: a.utilisateur_id, date: x.date, type: x.type ?? 'autre',
        titre: x.titre ?? '', lieu: x.lieu ?? '', participants: x.participants ?? [], redacteur: a.nom, contenu }));
      await this.hist.tracer(em, a, 'reunion', null, plain(reu), { session_id });
      const refs = { actions: [] as string[], risques: [] as string[], changements: [] as string[] };
      for (const t of x.actions ?? []) {
        const ref = await this.prochaineRef(em, 'action', p.id, 'A');
        const r = await em.save(E.Action, em.create(E.Action, { organisation_id: p.organisation_id, projet_id: p.id, cree_par: a.utilisateur_id, ref, action: t.action,
          responsable: t.responsable ?? '', echeance: t.echeance ?? null, statut: 'a_faire', origine_type: 'reunion', origine_id: reu.id }));
        await this.hist.tracer(em, a, 'action', null, plain(r), { session_id }); refs.actions.push(ref);
      }
      for (const t of x.risques ?? []) {
        const ref = await this.prochaineRef(em, 'risque', p.id, 'R');
        const r = await em.save(E.Risque, em.create(E.Risque, { organisation_id: p.organisation_id, projet_id: p.id, cree_par: a.utilisateur_id, ref, titre: t.titre, categorie: t.categorie ?? '',
          probabilite: t.probabilite, impact: t.impact, parade: t.parade ?? '', responsable: t.responsable ?? '', date: x.date, statut: 'ouvert' }));
        await this.hist.tracer(em, a, 'risque', null, plain(r), { session_id }); refs.risques.push(ref);
      }
      for (const c of x.changements ?? []) refs.changements.push((await this.proposerChangement(a, code, { ...c, origine: `réunion du ${x.date}` }, session_id, em)).ref);
      return { reunion_id: reu.id, date: x.date, ...refs };
    });
  }
}
