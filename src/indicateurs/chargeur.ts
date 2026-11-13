import { EntityManager, In } from 'typeorm';
import * as E from '../db/entities';
import { ModeleProjet } from './calcul';

const s = (v: string | null | undefined) => v ?? '';

/**
 * Reconstruit, depuis la base, un projet dans la forme exacte attendue par calculer() (forme du kit v1).
 * L'ordre des listes reproduit celui du kit (ordre des fichiers YAML, tris par date) car il influe sur
 * l'ordre des alertes et des lots.
 */
export async function chargerModele(em: EntityManager, projet: E.Projet): Promise<ModeleProjet> {
  const w = { projet_id: projet.id };
  const [depots, exigences, foncs, tests, campagnes, retours, docs, jalons, risques, actions, changements, pps, reunions, sessions] = await Promise.all([
    em.find(E.Depot, { where: w, order: { ordre: 'ASC', nom: 'ASC' } }),
    em.find(E.Exigence, { where: w, order: { ordre: 'ASC', ref: 'ASC' } }),
    em.find(E.Fonctionnalite, { where: w, order: { ordre: 'ASC', ref: 'ASC' } }),
    em.find(E.CasTest, { where: w, order: { ordre: 'ASC', ref: 'ASC' } }),
    em.find(E.Campagne, { where: w, order: { date: 'ASC', ref: 'ASC' } }),
    em.find(E.RetourClient, { where: w, order: { date: { direction: 'DESC', nulls: 'LAST' }, ref: 'ASC' } }),
    em.find(E.Document, { where: w, order: { ordre: 'ASC', code: 'ASC' } }),
    em.find(E.Jalon, { where: w, order: { ordre: 'ASC', date_prevue: 'ASC' } }),
    em.find(E.Risque, { where: w, order: { ref: 'ASC' } }),
    em.find(E.Action, { where: w, order: { ref: 'ASC' } }),
    em.find(E.Changement, { where: w, order: { ref: 'ASC' } }),
    em.find(E.PartiePrenante, { where: w, order: { cree_le: 'ASC' } }),
    em.find(E.Reunion, { where: w, order: { date: 'DESC' } }),
    em.find(E.SessionDev, { where: w, order: { debut: 'DESC' } }),
  ]);
  const idsF = foncs.map((f) => f.id);
  const refF = new Map(foncs.map((f) => [f.id, f.ref]));
  const nomD = new Map(depots.map((d) => [d.id, d.nom]));
  const refEx = new Map(exigences.map((e) => [e.id, e.ref]));
  const refT = new Map(tests.map((t) => [t.id, t.ref]));
  const [fe, fd, resultats, rf, cf, jd, types, scans, journal] = await Promise.all([
    idsF.length ? em.findBy(E.FonctionnaliteExigence, { fonctionnalite_id: In(idsF) }) : [],
    idsF.length ? em.findBy(E.FonctionnaliteDepot, { fonctionnalite_id: In(idsF) }) : [],
    campagnes.length ? em.findBy(E.ResultatTest, { campagne_id: In(campagnes.map((c) => c.id)) }) : [],
    retours.length ? em.findBy(E.RetourFonctionnalite, { retour_id: In(retours.map((r) => r.id)) }) : [],
    changements.length ? em.findBy(E.ChangementFonctionnalite, { changement_id: In(changements.map((c) => c.id)) }) : [],
    jalons.length ? em.find(E.JalonDocument, { where: { jalon_id: In(jalons.map((j) => j.id)) }, order: { ordre: 'ASC' } }) : [],
    em.find(E.TypeDocument, { where: { organisation_id: projet.organisation_id }, order: { ordre: 'ASC' } }),
    em.find(E.Fichier, { where: { projet_id: projet.id, categorie: 'scan_signe' } }),
    em.query(`SELECT ts, evt, fonctionnalites, depot_id, auteur, fichier, hash, message FROM evenement_journal
              WHERE projet_id = $1 AND supprime_le IS NULL ORDER BY ts, seq`, [projet.id]),
  ]);
  const phases = await em.find(E.PhaseDocument, { where: { organisation_id: projet.organisation_id }, order: { ordre: 'ASC' } });

  const grp = <T, K>(l: T[], k: (x: T) => K) => { const m = new Map<K, T[]>(); for (const x of l) m.set(k(x), [...(m.get(k(x)) ?? []), x]); return m; };
  const feP = grp(fe, (x) => x.fonctionnalite_id);
  const fdP = grp(fd, (x) => x.fonctionnalite_id);
  const resP = grp(resultats, (x) => x.campagne_id);
  const rfP = grp(rf, (x) => x.retour_id);
  const cfP = grp(cf, (x) => x.changement_id);
  const jdP = grp(jd, (x) => x.jalon_id);
  const typeParId = new Map(types.map((t) => [t.id, t]));
  const catalogueDoc = (t: E.TypeDocument) => ({ code: t.code, titre: t.titre, phase: t.phase, producteur: t.producteur, livrable: t.livrable, signature: t.signature, recurrent: t.recurrent, description: t.description, emplacement: t.emplacement });

  return {
    projet: { code: projet.code, nom: projet.nom, client: projet.client, chef_projet: projet.chef_projet, statut: projet.statut, date_debut: s(projet.date_debut), date_livraison_prevue: s(projet.date_livraison_prevue) },
    depots: depots.map((d) => ({ nom: d.nom, url: d.url, stack: d.stack, role: d.role, _id: d.id })),
    exigences: exigences.map((e) => ({ id: e.ref, titre: e.titre, section_tdr: e.section_tdr, priorite: e.priorite, _id: e.id })),
    fonctionnalites: foncs.map((f) => {
      const ds = fdP.get(f.id) ?? [];
      return {
        id: f.ref, titre: f.titre, jalon: f.jalon, poids: f.poids, statut: f.statut, origine: f.origine, notes: f.notes,
        exigences: (feP.get(f.id) ?? []).map((x) => refEx.get(x.exigence_id)).filter(Boolean).sort(),
        ...(ds.length ? { depots: Object.fromEntries(depots.filter((d) => ds.some((x) => x.depot_id === d.id)).map((d) => [d.nom, ds.find((x) => x.depot_id === d.id)!.statut])) } : {}),
        _id: f.id,
      };
    }),
    tests: tests.map((t) => ({ id: t.ref, fonctionnalite: t.fonctionnalite_id ? refF.get(t.fonctionnalite_id) : undefined, titre: t.titre, preconditions: t.preconditions, etapes: t.etapes, attendu: t.attendu, _id: t.id })),
    campagnes: campagnes.map((c) => ({
      id: c.ref, titre: c.titre, date: s(c.date), type: c.type, environnement: c.environnement, testeurs: c.testeurs, _id: c.id,
      resultats: (resP.get(c.id) ?? []).sort((a, b) => (refT.get(a.cas_test_id) ?? '').localeCompare(refT.get(b.cas_test_id) ?? ''))
        .map((r) => ({ test: refT.get(r.cas_test_id), resultat: r.resultat, commentaire: r.commentaire })),
    })),
    retours: retours.map((r) => ({
      id: r.ref, date: s(r.date), source: r.source, contact_client: r.contact_client, saisi_par: r.saisi_par, type: r.type, priorite: r.priorite,
      statut: r.statut, date_resolution: s(r.date_resolution), corps: r.contenu || `## Retour du client\n\n${r.retour}\n`, retour: r.retour,
      fonctionnalites: (rfP.get(r.id) ?? []).map((x) => refF.get(x.fonctionnalite_id)).filter(Boolean).sort(), _id: r.id,
    })),
    journal: journal.map((e: any) => ({ ts: new Date(e.ts).toISOString(), evt: e.evt, fonctionnalites: e.fonctionnalites, depot: nomD.get(e.depot_id), auteur: e.auteur, fichier: e.fichier, hash: e.hash, message: e.message })),
    sessions: sessions.map((x) => ({ date: x.debut.toISOString().slice(0, 10), depot: x.depot_id ? nomD.get(x.depot_id) : '', auteur: x.auteur, fonctionnalites: x.fonctionnalites, corps: x.resume, _id: x.id })),
    catalogue: { phases: phases.map((p) => ({ code: p.code, titre: p.titre })), documents: types.map(catalogueDoc) },
    suiviDocuments: docs.map((d) => {
      const t = d.type_document_id ? typeParId.get(d.type_document_id) : undefined;
      const ref = t ? catalogueDoc(t) : {};
      return {
        ...ref, code: d.code, statut: d.statut, echeance: s(d.echeance), responsable: d.responsable, version: d.version,
        date_validation: s(d.date_validation), notes: d.notes, lien: d.lien_externe,
        titre: d.titre || t?.titre || d.code, phase: d.phase || t?.phase || 'pilotage',
        scans: scans.filter((f) => f.document_id === d.id).map((f) => f.nom), inconnu: !t && !d.titre, _id: d.id,
      };
    }),
    planning: jalons.map((j) => ({ id: j.ref, nom: j.nom, date_prevue: s(j.date_prevue), date_reelle: s(j.date_reelle), lot: j.lot, facturation: j.facturation, livrables: (jdP.get(j.id) ?? []).map((x) => x.code_document), _id: j.id })),
    risques: risques.map((r) => ({ id: r.ref, titre: r.titre, categorie: r.categorie, probabilite: r.probabilite, impact: r.impact, parade: r.parade, responsable: r.responsable, date: s(r.date), statut: r.statut, _id: r.id })),
    actions: actions.map((a) => ({ id: a.ref, action: a.action, responsable: a.responsable, echeance: s(a.echeance), statut: a.statut, origine: a.origine_id, _id: a.id })),
    changements: changements.map((c) => ({ id: c.ref, titre: c.titre, demandeur: c.demandeur, date: s(c.date), description: c.description, origine: c.origine, impact_delai_jours: c.impact_delai_jours, impact_cout: c.impact_cout, decision: c.decision, date_decision: s(c.date_decision), avenant: c.avenant, fonctionnalites: (cfP.get(c.id) ?? []).map((x) => refF.get(x.fonctionnalite_id)).filter(Boolean).sort(), _id: c.id })),
    partiesPrenantes: pps.map((x) => ({ nom: x.nom, fonction: x.fonction, organisme: x.organisme, role: x.role, influence: x.influence, attentes: x.attentes })),
    reunions: reunions.map((r) => ({ date: s(r.date), type: r.type, lieu: r.lieu, participants: r.participants, redacteur: r.redacteur, corps: r.contenu, _id: r.id })),
    erreurs: [],
  };
}
