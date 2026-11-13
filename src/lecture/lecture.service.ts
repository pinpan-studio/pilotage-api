import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import * as E from '../db/entities';
import { Acteur } from '../common/acteur';
import { AccesService } from '../common/acces.service';
import { introuvable } from '../common/erreurs';
import { IndicateursService } from '../indicateurs/indicateurs.service';
import { aujourdhui, avancementFonctionnalite, statutEffectif } from '../indicateurs/calcul';
import * as V from "./vues.dto";
import { BaseProjet } from "../db/entities/base";

export interface FiltreJournal { depot?: string; auteur?: string; evt?: string; fonctionnalite?: string; depuis?: string; jusqua?: string; page?: number; par_page?: number }

@Injectable()
export class LectureService {
  constructor(@InjectDataSource() private readonly db: DataSource, private readonly acces: AccesService, private readonly ind: IndicateursService) {}

  private get em() { return this.db.manager; }
  projet(a: Acteur, code: string) { return this.acces.projet(a, code); }

  // ------------------------------------------------------------- indicateurs

  async indicateurs(a: Acteur, code: string, maintenant = aujourdhui()): Promise<V.IndicateursDto> {
    const p = await this.projet(a, code);
    return this.indicateursDe(p, maintenant);
  }

  async indicateursDe(p: E.Projet, maintenant = aujourdhui()): Promise<V.IndicateursDto> {
    const { indicateurs: m } = await this.ind.calculer(p, maintenant);
    const jalon = (j: any): V.JalonStatutDto => ({ ref: j.id, nom: j.nom, date_prevue: j.date_prevue, date_reelle: j.date_reelle, lot: j.lot, facturation: j.facturation, livrables: j.livrables, statut: j.statut, ecart: j.ecart });
    const synchro: { nom: string; derniere: Date | null }[] = await this.em.query(
      `SELECT d.nom, max(e.ts) AS derniere FROM depot d LEFT JOIN evenement_journal e ON e.depot_id = d.id AND e.supprime_le IS NULL
       WHERE d.projet_id = $1 AND d.supprime_le IS NULL GROUP BY d.nom, d.ordre ORDER BY d.ordre`, [p.id]);
    return {
      date_calcul: maintenant,
      avancement: m.avancement, nb_fonctionnalites: m.nbFonctionnalites, par_statut: m.parStatut,
      par_lot: m.parJalon, par_depot: m.parDepot, couverture: m.couverture,
      exigences_non_couvertes: m.exigencesNonCouvertes.map((x: any) => x.id),
      recette: m.recette, taux_recette: m.tauxRecette, resultats_tests: m.resultatTest,
      retours_ouverts: m.retoursOuverts.map((r: any) => r.id), delai_moyen_resolution: m.delaiMoyenResolution,
      activite_par_jour: Object.entries(m.activiteParJour as Record<string, number>).sort().map(([jour, nb]) => ({ jour, nb })),
      derniere_activite: m.derniereActivite, derniere_activite_fonctionnalite: m.derniereActiviteFonc, nb_commits: m.nbCommits,
      avancement_documents: m.avancementDocuments, documents_par_phase: m.parPhase,
      jalons: m.jalons.map(jalon), prochain_jalon: m.prochainJalon ? jalon(m.prochainJalon) : null,
      risques: m.risques.map((r: any) => ({ ref: r.id, titre: r.titre, statut: r.statut, criticite: r.criticite })),
      nb_risques_actifs: m.risquesActifs.length,
      actions_ouvertes: m.actionsOuvertes.map((x: any) => x.id), actions_en_retard: m.actionsEnRetard.map((x: any) => x.id),
      changements_en_analyse: m.changementsEnAnalyse.map((x: any) => x.id),
      synchronisation: synchro.map((s) => ({ depot: s.nom, derniere_synchro: s.derniere ? new Date(s.derniere).toISOString() : null })),
      alertes: m.alertes,
    };
  }

  async portefeuille(a: Acteur): Promise<V.ProjetResumeDto[]> {
    const res: V.ProjetResumeDto[] = [];
    for (const p of await this.acces.lister(a)) {
      const m = await this.indicateursDe(p);
      const n = { haute: 0, moyenne: 0, basse: 0 };
      for (const x of m.alertes) n[x.niveau]++;
      res.push({
        id: p.id, code: p.code, nom: p.nom, client: p.client, statut: p.statut, date_livraison_prevue: p.date_livraison_prevue,
        avancement: m.avancement, couverture: m.couverture, taux_recette: m.taux_recette, avancement_documents: m.avancement_documents,
        nb_retours_ouverts: m.retours_ouverts.length, nb_actions_en_retard: m.actions_en_retard.length,
        prochain_jalon: m.prochain_jalon, nb_alertes: n, derniere_activite: m.derniere_activite,
      });
    }
    return res;
  }

  async detail(a: Acteur, code: string): Promise<V.ProjetDetailDto> {
    const p = await this.projet(a, code);
    const depots = await this.em.find(E.Depot, { where: { projet_id: p.id }, order: { ordre: 'ASC' } });
    return {
      id: p.id, code: p.code, nom: p.nom, client: p.client, chef_projet: p.chef_projet, equipe: p.equipe, description: p.description,
      date_debut: p.date_debut, date_livraison_prevue: p.date_livraison_prevue, statut: p.statut, seuil_rappel_doc: p.seuil_rappel_doc,
      revision_perimetre: p.revision_perimetre, depots: depots.map((d) => ({ id: d.id, nom: d.nom, url: d.url, stack: d.stack, role: d.role })),
      mon_role: await this.acces.roleSurProjet(a, p), visibilite: p.visibilite,
      membre: !!(await this.em.findOneBy(E.MembreProjet, { projet_id: p.id, utilisateur_id: a.utilisateur_id })),
    };
  }

  async tdr(a: Acteur, code: string) { return { contenu: (await this.projet(a, code)).tdr }; }

  // ------------------------------------------------------------- fonctionnalités

  async fonctionnalites(a: Acteur, code: string, f: { statut?: string; depot?: string; lot?: string } = {}): Promise<V.FonctionnaliteDto[]> {
    const p = await this.projet(a, code);
    const modele = await this.ind.modele(p);
    const derniere: Record<string, string> = modele.journalAgrege?.parFonctionnalite ?? {};
    if (!modele.journalAgrege) for (const e of modele.journal) for (const id of e.fonctionnalites ?? []) derniere[id] = e.ts;
    const testsPar: Record<string, string[]> = {};
    for (const t of modele.tests) (testsPar[t.fonctionnalite] ??= []).push(t.id);
    const retoursPar: Record<string, string[]> = {};
    for (const r of modele.retours) for (const id of r.fonctionnalites) (retoursPar[id] ??= []).push(r.id);
    return modele.fonctionnalites
      .map((x: any): V.FonctionnaliteDto => ({
        id: x._id, ref: x.id, titre: x.titre, jalon: x.jalon, poids: x.poids, statut: x.statut,
        statut_effectif: statutEffectif(x), avancement: x.statut === 'abandonne' ? 0 : avancementFonctionnalite(x),
        origine: x.origine, notes: x.notes, exigences: x.exigences,
        depots: Object.entries(x.depots ?? {}).map(([depot, statut]) => ({ depot, statut: String(statut) })),
        cas_test: testsPar[x.id] ?? [], retours: retoursPar[x.id] ?? [], derniere_activite: derniere[x.id] ?? null,
      }))
      .filter((x) => (!f.statut || x.statut_effectif === f.statut || x.statut === f.statut)
        && (!f.depot || x.depots.some((d) => d.depot === f.depot)) && (!f.lot || x.jalon === f.lot));
  }

  async fonctionnalite(a: Acteur, code: string, ref: string): Promise<V.FonctionnaliteDetailDto> {
    const liste = await this.fonctionnalites(a, code);
    const f = liste.find((x) => x.ref === ref);
    if (!f) throw introuvable(`fonctionnalité ${ref}`);
    const p = await this.projet(a, code);
    const { indicateurs: m, modele } = await this.ind.calculer(p);
    const tests = modele.tests.filter((t: any) => t.fonctionnalite === ref)
      .map((t: any) => ({ ref: t.id, titre: t.titre, resultat: m.resultatTest[t.id]?.resultat ?? 'non_teste', campagne: m.resultatTest[t.id]?.campagne ?? null }));
    const journal = (await this.journal(a, code, { fonctionnalite: ref, par_page: 50 })).elements;
    const commits = (await this.journal(a, code, { fonctionnalite: ref, evt: 'commit', par_page: 50 })).elements;
    const ent = await this.em.findOneBy(E.Fonctionnalite, { projet_id: p.id, ref });
    return { ...f, description: ent?.description ?? '', tests, journal, commits };
  }

  // ------------------------------------------------------------- traçabilité

  /** Matrice exigence → fonctionnalités → tests (dernier résultat) → retours ; plus les fonctionnalités hors TDR. */
  async tracabilite(a: Acteur, code: string): Promise<V.TracabiliteDto> {
    const p = await this.projet(a, code);
    const { indicateurs: m, modele } = await this.ind.calculer(p);
    const retoursPar: Record<string, { ref: string; statut: string; type: string }[]> = {};
    for (const r of modele.retours) for (const f of r.fonctionnalites) (retoursPar[f] ??= []).push({ ref: r.id, statut: r.statut, type: r.type });
    const ligneF = (f: any): V.TraceFonctionnaliteDto => ({
      ref: f.id, titre: f.titre, statut: statutEffectif(f), avancement: f.statut === 'abandonne' ? 0 : avancementFonctionnalite(f),
      tests: modele.tests.filter((t: any) => t.fonctionnalite === f.id).map((t: any) => ({ ref: t.id, titre: t.titre, resultat: m.resultatTest[t.id]?.resultat ?? 'non_teste', campagne: m.resultatTest[t.id]?.campagne ?? null })),
      retours: retoursPar[f.id] ?? [],
    });
    const actives = modele.fonctionnalites.filter((f: any) => f.statut !== 'abandonne');
    const exigences = modele.exigences.map((e: any) => {
      const fs = actives.filter((f: any) => (f.exigences ?? []).includes(e.id)).map(ligneF);
      const tests = fs.flatMap((f) => f.tests);
      const etat: V.TraceExigenceDto['etat'] = !fs.length ? 'non_couverte' : tests.length && tests.every((t) => t.resultat === 'ok') ? 'recettee' : tests.some((t) => t.resultat === 'ko') ? 'ko' : tests.length ? 'en_recette' : 'sans_test';
      return { ref: e.id, titre: e.titre, priorite: e.priorite, section_tdr: e.section_tdr, etat, fonctionnalites: fs };
    });
    const hors = actives.filter((f: any) => !(f.exigences ?? []).length).map(ligneF);
    const n = (k: string) => exigences.filter((e) => e.etat === k).length;
    return { exigences, hors_tdr: hors, synthese: { total: exigences.length, non_couvertes: n('non_couverte'), sans_test: n('sans_test'), ko: n('ko'), en_recette: n('en_recette'), recettees: n('recettee') } };
  }

  // ------------------------------------------------------------- documents

  private async docs(p: E.Projet) {
    const [docs, types, jalons] = await Promise.all([
      this.em.find(E.Document, { where: { projet_id: p.id }, order: { ordre: 'ASC' } }),
      this.em.find(E.TypeDocument, { where: { organisation_id: p.organisation_id } }),
      this.em.query(`SELECT jd.code_document, j.date_prevue FROM jalon_document jd JOIN jalon j ON j.id = jd.jalon_id WHERE j.projet_id = $1 AND j.supprime_le IS NULL ORDER BY j.ordre`, [p.id]),
    ]);
    const ids = docs.map((d) => d.id);
    const compte = async (table: string, extra = '') => Object.fromEntries((ids.length ? await this.em.query(
      `SELECT document_id, count(*)::int n FROM ${table} WHERE document_id = ANY($1) AND supprime_le IS NULL ${extra} GROUP BY document_id`, [ids]) : []).map((r: any) => [r.document_id, r.n]));
    const [nbV, nbS] = [await compte('version_document'), await compte('fichier', "AND categorie = 'scan_signe'")];
    const tp = new Map(types.map((t) => [t.id, t]));
    const jalonDe: Record<string, string> = {};
    for (const j of jalons) jalonDe[j.code_document] = j.date_prevue; // dernier jalon gagne, comme le kit
    return docs.map((d) => {
      const t = d.type_document_id ? tp.get(d.type_document_id) : undefined;
      const vue: V.DocumentDto = {
        id: d.id, code: d.code, titre: d.titre || t?.titre || d.code, phase: d.phase || t?.phase || 'pilotage',
        producteur: t?.producteur ?? 'mixte', livrable: t?.livrable ?? false, signature: t?.signature ?? false, recurrent: t?.recurrent ?? false,
        statut: d.statut, echeance: d.echeance, echeance_effective: d.echeance || jalonDe[d.code] || null, responsable: d.responsable,
        version: d.version, date_validation: d.date_validation, lien_externe: d.lien_externe, notes: d.notes,
        nb_versions: nbV[d.id] ?? 0, nb_scans: nbS[d.id] ?? 0,
      };
      return { vue, type: t };
    });
  }

  async documents(a: Acteur, code: string, f: { phase?: string; statut?: string } = {}): Promise<V.DocumentDto[]> {
    const p = await this.projet(a, code);
    return (await this.docs(p)).map((x) => x.vue).filter((d) => (!f.phase || d.phase === f.phase) && (!f.statut || d.statut === f.statut));
  }

  async document(a: Acteur, code: string, codeDoc: string, numero?: string): Promise<V.DocumentDetailDto> {
    const p = await this.projet(a, code);
    const x = (await this.docs(p)).find((d) => d.vue.code === codeDoc);
    if (!x) throw introuvable(`document ${codeDoc}`);
    const versions = await this.em.find(E.VersionDocument, { where: { document_id: x.vue.id }, order: { cree_le: 'DESC' } });
    const noms = await this.noms(versions.map((v) => v.auteur_id));
    const resume = (v: E.VersionDocument): V.VersionResumeDto => ({ id: v.id, numero: v.numero, resume_modif: v.resume_modif, auteur_type: v.auteur_type, auteur: noms[v.auteur_id ?? ''] ?? '', figee: v.figee, cree_le: v.cree_le });
    const courante = numero ? versions.find((v) => v.numero === numero) : versions[0];
    if (numero && !courante) throw introuvable(`version ${numero} du document ${codeDoc}`);
    const modele = x.type?.modele_id ? await this.em.findOneBy(E.ModeleDocument, { id: x.type.modele_id }) : null;
    return {
      ...x.vue, description: x.type?.description ?? '', modele: modele?.code ?? null, versions: versions.map(resume),
      version_courante: courante ? { ...resume(courante), contenu: courante.contenu } : null,
    };
  }

  private async noms(ids: (string | null)[]): Promise<Record<string, string>> {
    const u = [...new Set(ids.filter(Boolean))] as string[];
    if (!u.length) return {};
    return Object.fromEntries((await this.em.findBy(E.Utilisateur, { id: In(u) })).map((x) => [x.id, x.nom]));
  }

  // ------------------------------------------------------------- journal

  async journal(a: Acteur, code: string, f: FiltreJournal = {}): Promise<V.PageEvenementsDto> {
    const p = await this.projet(a, code);
    const par_page = Math.min(Math.max(Number(f.par_page) || 50, 1), 200);
    const page = Math.max(Number(f.page) || 1, 1);
    const qb = this.em.createQueryBuilder(E.EvenementJournal, 'e').leftJoin(E.Depot, 'd', 'd.id = e.depot_id')
      .select(['e.id AS id', 'e.ts AS ts', 'e.evt AS evt', 'd.nom AS depot', 'e.auteur AS auteur', 'e.outil AS outil', 'e.fichier AS fichier',
        'e.commande AS commande', 'e.hash AS hash', 'e.message AS message', 'e.fonctionnalites AS fonctionnalites'])
      .where('e.projet_id = :p', { p: p.id });
    if (f.depot) qb.andWhere('d.nom = :depot', { depot: f.depot });
    if (f.auteur) qb.andWhere('e.auteur = :auteur', { auteur: f.auteur });
    if (f.evt) qb.andWhere('e.evt = :evt', { evt: f.evt });
    if (f.fonctionnalite) qb.andWhere(':fo = ANY(e.fonctionnalites)', { fo: f.fonctionnalite });
    if (f.depuis) qb.andWhere('e.ts >= :depuis', { depuis: f.depuis });
    if (f.jusqua) qb.andWhere('e.ts <= :jusqua', { jusqua: f.jusqua });
    const total = await qb.getCount();
    const rows = await qb.orderBy('e.ts', 'DESC').addOrderBy('e.seq', 'DESC').offset((page - 1) * par_page).limit(par_page).getRawMany();
    return { total, page, par_page, elements: rows.map((r) => ({ ...r, ts: new Date(r.ts).toISOString() })) };
  }

  async sessions(a: Acteur, code: string): Promise<V.SessionDto[]> {
    const p = await this.projet(a, code);
    const [s, depots] = await Promise.all([
      this.em.find(E.SessionDev, { where: { projet_id: p.id }, order: { debut: 'DESC' }, take: 200 }),
      this.em.find(E.Depot, { where: { projet_id: p.id } }),
    ]);
    const nom = new Map(depots.map((d) => [d.id, d.nom]));
    return s.map((x) => ({ id: x.id, depot: x.depot_id ? nom.get(x.depot_id) ?? null : null, auteur: x.auteur, utilisateur_id: x.utilisateur_id, debut: x.debut, fin: x.fin, resume: x.resume, notes: x.notes, fonctionnalites: x.fonctionnalites }));
  }

  // ------------------------------------------------------------- registres (entités telles quelles)

  async registre<T extends BaseProjet>(a: Acteur, code: string, entite: new () => T, ordre: Record<string, 'ASC' | 'DESC'>): Promise<T[]> {
    const p = await this.projet(a, code);
    return this.em.find(entite as any, { where: { projet_id: p.id }, order: ordre }) as any;
  }

  async parRef<T extends BaseProjet>(a: Acteur, code: string, entite: new () => T, ref: string, quoi: string): Promise<T> {
    const p = await this.projet(a, code);
    const r = await this.em.findOne(entite as any, { where: { projet_id: p.id, ref } });
    if (!r) throw introuvable(`${quoi} ${ref}`);
    return r as any;
  }

  async campagne(a: Acteur, code: string, ref: string) {
    const c = await this.parRef(a, code, E.Campagne, ref, 'campagne');
    const res = await this.em.query(`SELECT t.ref AS test, r.resultat, r.commentaire FROM resultat_test r JOIN cas_test t ON t.id = r.cas_test_id
      WHERE r.campagne_id = $1 AND r.supprime_le IS NULL ORDER BY t.ordre, t.ref`, [c.id]);
    return { ...c, resultats: res };
  }

  async retour(a: Acteur, code: string, ref: string) {
    const r = await this.parRef(a, code, E.RetourClient, ref, 'retour');
    const f = await this.em.query(`SELECT f.ref FROM retour_fonctionnalite rf JOIN fonctionnalite f ON f.id = rf.fonctionnalite_id WHERE rf.retour_id = $1 ORDER BY f.ref`, [r.id]);
    return { ...r, fonctionnalites: f.map((x: any) => x.ref) };
  }

  async docTechnique(a: Acteur, code: string, f: { depot?: string; chemin?: string }) {
    const p = await this.projet(a, code);
    const qb = this.em.createQueryBuilder(E.DocTechnique, 't').leftJoin(E.Depot, 'd', 'd.id = t.depot_id')
      .addSelect('d.nom', 'depot').where('t.projet_id = :p', { p: p.id }).orderBy('t.chemin');
    if (f.depot) qb.andWhere('d.nom = :d', { d: f.depot });
    if (f.chemin) qb.andWhere('t.chemin = :c', { c: f.chemin });
    const { entities, raw } = await qb.getRawAndEntities();
    return entities.map((t, i) => ({ ...t, depot: raw[i]?.depot ?? null }));
  }

  async catalogue(a: Acteur) {
    const [phases, types] = await Promise.all([
      this.em.find(E.PhaseDocument, { where: { organisation_id: a.organisation_id }, order: { ordre: 'ASC' } }),
      this.em.find(E.TypeDocument, { where: { organisation_id: a.organisation_id }, order: { ordre: 'ASC' } }),
    ]);
    return { phases, types };
  }

  async modele(a: Acteur, code: string) {
    const m = await this.em.findOneBy(E.ModeleDocument, { organisation_id: a.organisation_id, code: code.endsWith('.md') || code.endsWith('.yaml') ? code : `${code}.md` });
    if (!m) throw introuvable(`modèle ${code}`);
    return m;
  }

  async phases(organisation_id: string) {
    return this.em.find(E.PhaseDocument, { where: { organisation_id }, order: { ordre: 'ASC' } });
  }
}
