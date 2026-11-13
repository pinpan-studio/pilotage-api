import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import * as E from '../db/entities';
import { Acteur } from '../common/acteur';
import { AccesService } from '../common/acces.service';
import { HistoriqueService } from '../common/historique.service';
import { introuvable, invalide, refuse } from '../common/erreurs';
import { ReglesAgent } from '../common/regles-agent';
import { STATUTS_RETOUR, STATUTS_RISQUE } from '../indicateurs/referentiels';
import { EcritureService } from './ecriture.service';

const plain = (o: any) => JSON.parse(JSON.stringify(o));
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const date = (v: string | null | undefined, quoi: string) => { if (v && !DATE.test(v)) throw invalide(`${quoi} au format AAAA-MM-JJ.`); };

/** Saisie « humaine » complète : fonctionnalités, exigences, jalons, registres, décisions. */
@Injectable()
export class GestionService {
  constructor(@InjectDataSource() private readonly db: DataSource, private readonly acces: AccesService,
    private readonly hist: HistoriqueService, private readonly ecriture: EcritureService) {}

  private async projet(a: Acteur, code: string) { const p = await this.acces.projet(a, code); await this.acces.exigerEcriture(a, p); return p; }
  private tx<T>(p: E.Projet, fn: (em: EntityManager) => Promise<T>) {
    return this.db.transaction(async (em) => { await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [p.id]); return fn(em); });
  }
  /** Référence suivante en conservant le format du kit (EX-01, J1). */
  private async ref(em: EntityManager, table: string, projet_id: string, prefixe: string, pad: number) {
    const r = await em.query(`SELECT ref FROM "${table}" WHERE projet_id = $1`, [projet_id]);
    const max = r.reduce((m: number, x: any) => { const n = Number(String(x.ref).replace(/^\D+/, '')); return Number.isFinite(n) && n > m ? n : m; }, 0);
    return prefixe + String(max + 1).padStart(pad, '0');
  }
  private async modifier<T extends object>(em: EntityManager, a: Acteur, table: string, cible: any, x: Partial<T>, session_id?: string) {
    const avant = plain(cible);
    for (const [k, v] of Object.entries(x)) if (v !== undefined) cible[k] = v;
    const apres = await em.save(cible);
    await this.hist.tracer(em, a, table, avant, plain(apres), { session_id });
    return apres;
  }

  // ---------------------------------------------------------------- fonctionnalités
  async majFonctionnalite(a: Acteur, code: string, ref: string, x: { titre?: string; lot?: string; poids?: number; description?: string; depots?: string[]; exigences?: string[] }, session_id?: string) {
    if (x.poids != null && ![1, 2, 3, 5, 8].includes(x.poids)) throw invalide('poids attendu : 1, 2, 3, 5 ou 8.');
    if (x.titre != null && !x.titre.trim()) throw invalide('le titre est vide.');
    const p = await this.projet(a, code);
    return this.tx(p, async (em) => {
      const f = await em.findOneBy(E.Fonctionnalite, { projet_id: p.id, ref });
      if (!f) throw introuvable(`fonctionnalité ${ref}`);
      if (x.depots) {
        const ids: string[] = [];
        for (const nom of x.depots) { const d = await em.findOneBy(E.Depot, { projet_id: p.id, nom }); if (!d) throw introuvable(`dépôt « ${nom} »`); ids.push(d.id); }
        const actuels = await em.findBy(E.FonctionnaliteDepot, { fonctionnalite_id: f.id });
        for (const fd of actuels) if (!ids.includes(fd.depot_id)) await em.delete(E.FonctionnaliteDepot, { fonctionnalite_id: f.id, depot_id: fd.depot_id });
        for (const id of ids) if (!actuels.some((fd) => fd.depot_id === id)) await em.insert(E.FonctionnaliteDepot, { fonctionnalite_id: f.id, depot_id: id, statut: 'a_faire' });
      }
      if (x.exigences) {
        if (a.role === 'agent') throw refuse("l'agent ne peut pas modifier la traçabilité aux exigences.");
        await em.delete(E.FonctionnaliteExigence, { fonctionnalite_id: f.id });
        for (const r of x.exigences) { const ex = await em.findOneBy(E.Exigence, { projet_id: p.id, ref: r }); if (!ex) throw introuvable(`exigence ${r}`); await em.insert(E.FonctionnaliteExigence, { fonctionnalite_id: f.id, exigence_id: ex.id }); }
      }
      return this.modifier(em, a, 'fonctionnalite', f, { titre: x.titre?.trim(), jalon: x.lot, poids: x.poids, description: x.description }, session_id);
    });
  }

  // ---------------------------------------------------------------- exigences (cadrage : humains, chef de projet)
  private async exigerCadrage(a: Acteur, p: E.Projet) {
    if (a.role === 'agent') throw refuse("l'agent ne peut pas modifier le TDR ni les exigences.");
    await this.acces.exigerChefProjet(a, p, 'modifier les exigences');
  }
  async creerExigence(a: Acteur, code: string, x: { titre: string; priorite?: string; section_tdr?: string; description?: string }) {
    if (x.priorite && !['must', 'should', 'could'].includes(x.priorite)) throw invalide('priorité : must, should ou could.');
    const p = await this.projet(a, code); await this.exigerCadrage(a, p);
    return this.tx(p, async (em) => {
      const ref = await this.ref(em, 'exigence', p.id, 'EX-', 2);
      const ordre = Number((await em.query('SELECT coalesce(max(ordre), -1) + 1 n FROM exigence WHERE projet_id = $1', [p.id]))[0].n);
      const e = await em.save(E.Exigence, em.create(E.Exigence, { organisation_id: p.organisation_id, projet_id: p.id, cree_par: a.utilisateur_id, ref, titre: x.titre,
        priorite: (x.priorite ?? 'should') as any, section_tdr: x.section_tdr ?? '', description: x.description ?? '', ordre }));
      await this.hist.tracer(em, a, 'exigence', null, plain(e), {});
      return e;
    });
  }
  async majExigence(a: Acteur, code: string, ref: string, x: { titre?: string; priorite?: string; section_tdr?: string; description?: string }) {
    if (x.priorite && !['must', 'should', 'could'].includes(x.priorite)) throw invalide('priorité : must, should ou could.');
    const p = await this.projet(a, code); await this.exigerCadrage(a, p);
    return this.tx(p, async (em) => {
      const e = await em.findOneBy(E.Exigence, { projet_id: p.id, ref }); if (!e) throw introuvable(`exigence ${ref}`);
      return this.modifier(em, a, 'exigence', e, x as any);
    });
  }

  // ---------------------------------------------------------------- jalons
  async creerJalon(a: Acteur, code: string, x: { nom: string; date_prevue?: string; lot?: string; facturation?: string; documents?: string[] }, session_id?: string) {
    date(x.date_prevue, 'date prévue');
    const p = await this.projet(a, code);
    return this.tx(p, async (em) => {
      const ref = await this.ref(em, 'jalon', p.id, 'J', 0);
      const ordre = Number((await em.query('SELECT coalesce(max(ordre), -1) + 1 n FROM jalon WHERE projet_id = $1', [p.id]))[0].n);
      const j = await em.save(E.Jalon, em.create(E.Jalon, { organisation_id: p.organisation_id, projet_id: p.id, cree_par: a.utilisateur_id, ref, nom: x.nom,
        date_prevue: x.date_prevue ?? null, date_reelle: null, lot: x.lot ?? '', facturation: x.facturation ?? '', ordre }));
      for (const [i, c] of (x.documents ?? []).entries()) await em.insert(E.JalonDocument, { jalon_id: j.id, code_document: c, ordre: i });
      await this.hist.tracer(em, a, 'jalon', null, plain(j), { session_id });
      return j;
    });
  }
  async majJalon(a: Acteur, code: string, ref: string, x: { nom?: string; date_prevue?: string | null; date_reelle?: string | null; lot?: string; facturation?: string }, session_id?: string) {
    date(x.date_prevue, 'date prévue'); date(x.date_reelle, 'date réelle');
    const p = await this.projet(a, code);
    return this.tx(p, async (em) => {
      const j = await em.findOneBy(E.Jalon, { projet_id: p.id, ref }); if (!j) throw introuvable(`jalon ${ref}`);
      return this.modifier(em, a, 'jalon', j, x as any, session_id);
    });
  }

  // ---------------------------------------------------------------- registres
  async majRisque(a: Acteur, code: string, ref: string, x: { titre?: string; statut?: string; probabilite?: number; impact?: number; parade?: string; responsable?: string; categorie?: string }, session_id?: string) {
    if (x.statut && !STATUTS_RISQUE.includes(x.statut)) throw invalide(`statut « ${x.statut} » (attendu : ${STATUTS_RISQUE.join(', ')}).`);
    for (const k of ['probabilite', 'impact'] as const) if (x[k] != null && !(x[k]! >= 1 && x[k]! <= 4)) throw invalide(`${k} doit être entre 1 et 4.`);
    const p = await this.projet(a, code);
    return this.tx(p, async (em) => {
      const r = await em.findOneBy(E.Risque, { projet_id: p.id, ref }); if (!r) throw introuvable(`risque ${ref}`);
      return this.modifier(em, a, 'risque', r, x as any, session_id);
    });
  }
  async majRetour(a: Acteur, code: string, ref: string, x: { statut?: string; analyse?: string; action?: string; priorite?: string; type?: string }, session_id?: string) {
    if (x.statut && !STATUTS_RETOUR.includes(x.statut)) throw invalide(`statut « ${x.statut} »`);
    const p = await this.projet(a, code);
    return this.tx(p, async (em) => {
      const r = await em.findOneBy(E.RetourClient, { projet_id: p.id, ref }); if (!r) throw introuvable(`retour ${ref}`);
      const resolu = x.statut && ['resolu', 'rejete'].includes(x.statut) ? new Date().toISOString().slice(0, 10) : undefined;
      return this.modifier(em, a, 'retour_client', r, { ...x, ...(resolu ? { date_resolution: resolu } : {}) } as any, session_id);
    });
  }
  /** Décision sur une demande de changement : humain, chef de projet. */
  async deciderChangement(a: Acteur, code: string, ref: string, x: { decision: string; avenant?: string; impact_delai_jours?: number; impact_cout?: string }) {
    if (!['en_analyse', 'accepte', 'refuse', 'reporte'].includes(x.decision)) throw invalide('décision : en_analyse, accepte, refuse ou reporte.');
    ReglesAgent.decisionChangement(a, x.decision);
    const p = await this.projet(a, code);
    if (x.decision !== 'en_analyse') await this.acces.exigerChefProjet(a, p, 'décider d’une demande de changement');
    return this.tx(p, async (em) => {
      const c = await em.findOneBy(E.Changement, { projet_id: p.id, ref }); if (!c) throw introuvable(`changement ${ref}`);
      return this.modifier(em, a, 'changement', c, { ...x, date_decision: x.decision === 'en_analyse' ? null : new Date().toISOString().slice(0, 10) } as any);
    });
  }
}
