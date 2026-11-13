/* eslint-disable */
// PORTAGE À L'IDENTIQUE de reference/kit-v1/scripts/lib/pilotage.mjs (section « calculs » et « vérification »).
// Ne pas modifier la logique ici sans la modifier dans le kit : le test indicateurs.spec.ts compare les deux.
// Le code est volontairement conservé tel quel (typage lâche) pour faciliter la comparaison ligne à ligne.
// @ts-nocheck
import {
  POIDS_STATUT, POIDS_DOCUMENT, LIBELLES, STATUTS_FONCTIONNALITE, STATUTS_DEPOT, STATUTS_DOCUMENT,
  STATUTS_RISQUE, STATUTS_ACTION, DECISIONS_CHANGEMENT, RESULTATS_TEST, STATUTS_RETOUR,
} from './referentiels';

/** Projet dans la forme du kit v1 (ids = références métier, depots = { nom: statut }). */
export interface ModeleProjet {
  projet: any; depots: any[]; exigences: any[]; fonctionnalites: any[]; tests: any[]; campagnes: any[];
  retours: any[]; journal: any[];
  /** Journal pré-agrégé (chargement depuis la base) ; à défaut, `journal` est parcouru (kit v1). */
  journalAgrege?: { parJour: Record<string, number>; derniere: string | null; parFonctionnalite: Record<string, string>; nbCommits: number }; sessions: any[]; catalogue: { phases: any[]; documents: any[] };
  suiviDocuments: any[]; planning: any[]; risques: any[]; actions: any[]; changements: any[];
  partiesPrenantes: any[]; reunions: any[]; erreurs: string[];
}
export type Indicateurs = Record<string, any>;

const tableau = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

// ---------------------------------------------------------------- calculs

const ORDRE_DEV = ['bloque', 'a_faire', 'en_cours', 'developpe'];

// Statut effectif d'une fonctionnalité : si des statuts par dépôt existent et que la
// fonctionnalité n'est pas encore en recette/validée, on prend le dépôt le moins avancé.
export function statutEffectif(f: any): string {
  const s = f.statut || 'a_faire';
  if (['recette', 'valide', 'abandonne'].includes(s)) return s;
  const d = f.depots && typeof f.depots === 'object' ? Object.values(f.depots) : [];
  if (!d.length) return s;
  if (d.includes('bloque')) return 'bloque';
  if (d.every((x) => x === 'developpe')) return 'developpe';
  if (d.every((x) => x === 'a_faire')) return 'a_faire';
  return 'en_cours';
}

export function avancementFonctionnalite(f: any): number {
  const s = f.statut || 'a_faire';
  if (['recette', 'valide'].includes(s)) return POIDS_STATUT[s];
  const d = f.depots && typeof f.depots === 'object' ? Object.values(f.depots) : [];
  if (d.length) return d.reduce((a, x) => a + (POIDS_STATUT[x] ?? 0), 0) / d.length;
  return POIDS_STATUT[s] ?? 0;
}

export const joursEntre = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
export const aujourdhui = () => new Date().toISOString().slice(0, 10); // Africa/Abidjan = UTC+0

export function calculer(p: ModeleProjet, { maintenant = aujourdhui() }: { maintenant?: string } = {}): Indicateurs {
  const actives = p.fonctionnalites.filter((f) => f.statut !== 'abandonne');
  const poidsTotal = actives.reduce((a, f) => a + (Number(f.poids) || 1), 0);
  const avancement = poidsTotal
    ? actives.reduce((a, f) => a + (Number(f.poids) || 1) * avancementFonctionnalite(f), 0) / poidsTotal
    : 0;

  const parStatut = {};
  for (const f of p.fonctionnalites) {
    const s = statutEffectif(f);
    parStatut[s] = (parStatut[s] || 0) + 1;
  }

  // Avancement par jalon / lot
  const lots = {};
  for (const f of actives) {
    const j = f.jalon || 'Sans jalon';
    lots[j] ??= { poids: 0, fait: 0, nb: 0 };
    const w = Number(f.poids) || 1;
    lots[j].poids += w;
    lots[j].fait += w * avancementFonctionnalite(f);
    lots[j].nb += 1;
  }
  const parJalon = Object.entries(lots).map(([nom, v]) => ({ nom, nb: v.nb, avancement: v.poids ? v.fait / v.poids : 0 }));

  // Avancement par dépôt
  const depotsNoms = new Set(p.depots.map((d) => d.nom));
  for (const f of actives) for (const k of Object.keys(f.depots || {})) depotsNoms.add(k);
  const parDepot = [...depotsNoms].map((nom) => {
    const fs = actives.filter((f) => f.depots && nom in f.depots);
    const w = fs.reduce((a, f) => a + (Number(f.poids) || 1), 0);
    const fait = fs.reduce((a, f) => {
      const s = ['recette', 'valide'].includes(f.statut) ? 'developpe' : f.depots[nom];
      return a + (Number(f.poids) || 1) * ((POIDS_STATUT[s] ?? 0) / POIDS_STATUT.developpe);
    }, 0);
    return { nom, nb: fs.length, avancement: w ? fait / w : 0 };
  });

  // Couverture des exigences du TDR
  const exigencesCouvertes = new Set(actives.flatMap((f) => tableau(f.exigences)));
  const exigencesNonCouvertes = p.exigences.filter((e) => !exigencesCouvertes.has(e.id));
  const couverture = p.exigences.length ? (p.exigences.length - exigencesNonCouvertes.length) / p.exigences.length : null;

  // Résultat de chaque test = dernière campagne qui l'a exécuté
  const resultatTest = {};
  for (const c of p.campagnes) {
    for (const r of c.resultats) {
      if (!r || !r.test) continue;
      if (r.resultat && r.resultat !== 'non_teste') resultatTest[r.test] = { resultat: r.resultat, campagne: c.id, commentaire: r.commentaire || '' };
      else resultatTest[r.test] ??= { resultat: 'non_teste', campagne: c.id, commentaire: r.commentaire || '' };
    }
  }
  const recette = { ok: 0, ko: 0, reserve: 0, non_teste: 0 };
  for (const t of p.tests) recette[resultatTest[t.id]?.resultat || 'non_teste'] += 1;
  const tauxRecette = p.tests.length ? recette.ok / p.tests.length : null;

  // Retours clients
  const retoursOuverts = p.retours.filter((r) => ['nouveau', 'en_cours'].includes(r.statut || 'nouveau'));
  const delais = p.retours
    .filter((r) => r.statut === 'resolu' && r.date && r.date_resolution)
    .map((r) => joursEntre(r.date, r.date_resolution));
  const delaiMoyenResolution = delais.length ? delais.reduce((a, b) => a + b, 0) / delais.length : null;

  // Activité (journal)
  // Ajout Pilotage : depuis la base, le journal arrive déjà agrégé par PostgreSQL (mêmes résultats, sans charger chaque événement).
  const ag = p.journalAgrege;
  const activiteParJour = ag ? { ...ag.parJour } : {};
  if (!ag) for (const e of p.journal) {
    const j = (e.ts || '').slice(0, 10);
    if (j) activiteParJour[j] = (activiteParJour[j] || 0) + 1;
  }
  const derniereActivite = ag ? ag.derniere : p.journal.length ? p.journal[p.journal.length - 1].ts : null;
  const derniereActiviteFonc = ag ? { ...ag.parFonctionnalite } : {};
  if (!ag) for (const e of p.journal) for (const id of tableau(e.fonctionnalites)) derniereActiviteFonc[id] = e.ts;
  const commits = ag ? [] : p.journal.filter((e) => e.evt === 'commit');
  const nbCommits = ag ? ag.nbCommits : commits.length;

  // Alertes
  const alertes = [];
  const testsParFonc = {};
  for (const t of p.tests) (testsParFonc[t.fonctionnalite] ??= []).push(t);
  for (const f of actives) {
    const s = statutEffectif(f);
    const ts = testsParFonc[f.id] || [];
    if (['recette', 'valide'].includes(s) && ts.some((t) => resultatTest[t.id]?.resultat === 'ko'))
      alertes.push({ niveau: 'haute', texte: `${f.id} est « ${LIBELLES[s]} » mais a un test KO dans la dernière campagne.` });
    if (s === 'developpe' && !ts.length)
      alertes.push({ niveau: 'moyenne', texte: `${f.id} est développée mais n'a aucun cas de test (lancer /recette).` });
    if (s === 'bloque') alertes.push({ niveau: 'haute', texte: `${f.id} est bloquée${f.notes ? ` : ${f.notes}` : '.'}` });
    if (s === 'en_cours' && derniereActiviteFonc[f.id] && joursEntre(derniereActiviteFonc[f.id].slice(0, 10), maintenant) > 14)
      alertes.push({ niveau: 'basse', texte: `${f.id} est en cours sans activité depuis plus de 14 jours.` });
  }
  for (const r of retoursOuverts) {
    if (r.priorite === 'haute' && r.date && joursEntre(r.date, maintenant) > 7)
      alertes.push({ niveau: 'haute', texte: `Retour ${r.id} (priorité haute) ouvert depuis ${joursEntre(r.date, maintenant)} jours.` });
  }
  for (const e of exigencesNonCouvertes.filter((x) => x.priorite === 'must'))
    alertes.push({ niveau: 'moyenne', texte: `Exigence obligatoire ${e.id} sans fonctionnalité associée.` });
  if (p.projet.date_livraison_prevue && p.projet.statut === 'en_cours') {
    const reste = joursEntre(maintenant, p.projet.date_livraison_prevue);
    if (reste < 0) alertes.push({ niveau: 'haute', texte: `Date de livraison dépassée de ${-reste} jours (avancement ${Math.round(avancement * 100)} %).` });
    else if (reste <= 14 && avancement < 0.8)
      alertes.push({ niveau: 'haute', texte: `Livraison dans ${reste} jours, avancement ${Math.round(avancement * 100)} %.` });
  }
  // Documents
  const docsActifs = p.suiviDocuments.filter((d) => d.statut !== 'sans_objet');
  const docsLivrables = docsActifs.filter((d) => d.livrable);
  const scoreDocs = (l) => (l.length ? l.reduce((a, d) => a + (POIDS_DOCUMENT[d.statut] ?? 0), 0) / l.length : null);
  const avancementDocuments = scoreDocs(docsLivrables.filter((d) => !d.recurrent));
  const parPhase = (p.catalogue.phases.length ? p.catalogue.phases : [{ code: 'pilotage', titre: 'Pilotage' }]).map((ph) => {
    const l = docsActifs.filter((d) => d.phase === ph.code);
    return { ...ph, nb: l.length, finalises: l.filter((d) => ['valide', 'signe'].includes(d.statut)).length, avancement: scoreDocs(l) };
  }).filter((x) => x.nb);
  const jalonDeDoc = {};
  for (const j of p.planning) for (const c of j.livrables) jalonDeDoc[c] = j;
  for (const d of docsActifs) {
    const ech = d.echeance || jalonDeDoc[d.code]?.date_prevue;
    if (ech && !['valide', 'signe'].includes(d.statut) && ech < maintenant)
      alertes.push({ niveau: d.livrable ? 'haute' : 'moyenne', texte: `Document « ${d.titre} » en retard (échéance ${ech}).` });
    if (d.signature && d.statut === 'signe' && !d.scans.length)
      alertes.push({ niveau: 'basse', texte: `« ${d.titre} » est signé mais aucun scan n'est rangé dans 08-livrables/signes/ (nommer le fichier ${d.code}-….pdf).` });
  }
  if (p.tests.length && recette.ko === 0 && p.campagnes.some((c) => c.type === 'client')) {
    const pvr = p.suiviDocuments.find((d) => d.code === 'PV-RECETTE');
    if (pvr && pvr.statut === 'a_produire') alertes.push({ niveau: 'moyenne', texte: 'Une recette client a eu lieu : le PV de recette est à produire (/document PV-RECETTE).' });
  }

  // Planning
  const jalons = p.planning.map((j) => {
    let statut = 'a_venir';
    if (j.date_reelle) statut = 'atteint';
    else if (j.date_prevue && j.date_prevue < maintenant) statut = 'en_retard';
    const ecart = j.date_reelle && j.date_prevue ? joursEntre(j.date_prevue, j.date_reelle) : statut === 'en_retard' ? joursEntre(j.date_prevue, maintenant) : null;
    return { ...j, statut, ecart };
  });
  for (const j of jalons.filter((x) => x.statut === 'en_retard'))
    alertes.push({ niveau: 'haute', texte: `Jalon « ${j.nom} » non atteint, prévu le ${j.date_prevue} (${j.ecart} j de retard).` });
  const prochainJalon = jalons.filter((j) => j.statut === 'a_venir').sort((a, b) => (a.date_prevue || '9').localeCompare(b.date_prevue || '9'))[0] || null;

  // Risques
  const risques = p.risques.map((r) => ({ ...r, criticite: (Number(r.probabilite) || 0) * (Number(r.impact) || 0) }))
    .sort((a, b) => b.criticite - a.criticite);
  const risquesActifs = risques.filter((r) => ['ouvert', 'surveille', 'survenu'].includes(r.statut || 'ouvert'));
  for (const r of risquesActifs.filter((x) => x.criticite >= 9 || x.statut === 'survenu'))
    alertes.push({ niveau: 'haute', texte: `Risque ${r.id} ${r.statut === 'survenu' ? 'survenu' : `critique (${r.criticite}/16)`} : ${r.titre}` });

  // Actions
  const actionsOuvertes = p.actions.filter((a) => ['a_faire', 'en_cours'].includes(a.statut || 'a_faire'));
  const actionsEnRetard = actionsOuvertes.filter((a) => a.echeance && a.echeance < maintenant);
  if (actionsEnRetard.length)
    alertes.push({ niveau: 'moyenne', texte: `${actionsEnRetard.length} action(s) en retard : ${actionsEnRetard.slice(0, 4).map((a) => `${a.id} (${a.responsable || '?'})`).join(', ')}.` });

  // Changements
  const changementsEnAnalyse = p.changements.filter((c) => (c.decision || 'en_analyse') === 'en_analyse');
  for (const c of changementsEnAnalyse.filter((x) => x.date && joursEntre(x.date, maintenant) > 14))
    alertes.push({ niveau: 'moyenne', texte: `Demande de changement ${c.id} en analyse depuis ${joursEntre(c.date, maintenant)} jours.` });

  for (const err of p.erreurs) alertes.push({ niveau: 'moyenne', texte: err });
  const ordre = { haute: 0, moyenne: 1, basse: 2 };
  alertes.sort((a, b) => ordre[a.niveau] - ordre[b.niveau]);

  return {
    avancement,
    nbFonctionnalites: actives.length,
    parStatut,
    parJalon,
    parDepot,
    couverture,
    exigencesNonCouvertes,
    resultatTest,
    recette,
    tauxRecette,
    retoursOuverts,
    delaiMoyenResolution,
    activiteParJour,
    derniereActivite,
    derniereActiviteFonc,
    commits,
    nbCommits,
    testsParFonc,
    avancementDocuments,
    parPhase,
    jalons,
    prochainJalon,
    risques,
    risquesActifs,
    actionsOuvertes,
    actionsEnRetard,
    changementsEnAnalyse,
    alertes,
  };
}

// ---------------------------------------------------------------- vérification

export function verifier(p: ModeleProjet): { erreurs: string[]; avertissements: string[] } {
  const erreurs = [...p.erreurs];
  const avert = [];
  const doublons = (liste, nom) => {
    const vus = new Set();
    for (const x of liste) {
      if (!x || !x.id) { erreurs.push(`${nom} : élément sans id`); continue; }
      if (vus.has(x.id)) erreurs.push(`${nom} : id en double ${x.id}`);
      vus.add(x.id);
    }
    return vus;
  };
  const ex = doublons(p.exigences, 'exigences');
  const fo = doublons(p.fonctionnalites, 'fonctionnalités');
  const te = doublons(p.tests, 'tests');
  doublons(p.retours, 'retours');
  const dep = new Set(p.depots.map((d) => d.nom));

  for (const f of p.fonctionnalites) {
    if (!f?.id) continue;
    if (f.statut && !STATUTS_FONCTIONNALITE.includes(f.statut)) erreurs.push(`${f.id} : statut inconnu « ${f.statut} »`);
    for (const e of tableau(f.exigences)) if (!ex.has(e)) erreurs.push(`${f.id} : exigence inconnue ${e}`);
    for (const [d, s] of Object.entries(f.depots || {})) {
      if (!STATUTS_DEPOT.includes(s)) erreurs.push(`${f.id} : statut de dépôt inconnu « ${s} » (${d})`);
      if (dep.size && !dep.has(d)) avert.push(`${f.id} : dépôt « ${d} » absent de depots.yaml`);
    }
    if (!tableau(f.exigences).length && (f.origine || 'TDR') === 'TDR') avert.push(`${f.id} : aucune exigence liée`);
  }
  for (const t of p.tests) if (t?.id && !fo.has(t.fonctionnalite)) erreurs.push(`${t.id} : fonctionnalité inconnue ${t.fonctionnalite}`);
  for (const c of p.campagnes) {
    for (const r of c.resultats) {
      if (!te.has(r?.test)) erreurs.push(`Campagne ${c.id} : test inconnu ${r?.test}`);
      if (r?.resultat && !RESULTATS_TEST.includes(r.resultat)) erreurs.push(`Campagne ${c.id} : résultat inconnu « ${r.resultat} »`);
    }
  }
  for (const r of p.retours) {
    if (!r.id) erreurs.push(`${r.__fichier} : retour sans id`);
    if (r.statut && !STATUTS_RETOUR.includes(r.statut)) erreurs.push(`${r.id} : statut inconnu « ${r.statut} »`);
    for (const f of r.fonctionnalites) if (!fo.has(f)) erreurs.push(`${r.id} : fonctionnalité inconnue ${f}`);
  }
  const codesCat = new Set(p.catalogue.documents.map((d) => d.code));
  const codesDocs = new Set();
  for (const d of p.suiviDocuments) {
    if (codesDocs.has(d.code)) erreurs.push(`documents.yaml : code en double ${d.code}`);
    codesDocs.add(d.code);
    if (!STATUTS_DOCUMENT.includes(d.statut)) erreurs.push(`document ${d.code} : statut inconnu « ${d.statut} »`);
    if (d.inconnu) avert.push(`document ${d.code} : absent du catalogue, ajouter titre et phase`);
    if (['en_revue', 'valide', 'signe'].includes(d.statut) && d.fichier && !d.existe) avert.push(`document ${d.code} : statut « ${d.statut} » mais fichier introuvable (${d.fichier})`);
  }
  for (const j of p.planning) for (const c of j.livrables) if (!codesDocs.has(c) && !codesCat.has(c)) erreurs.push(`jalon ${j.id || j.nom} : document inconnu ${c}`);
  doublons(p.risques, 'risques'); doublons(p.actions, 'actions'); doublons(p.changements, 'changements');
  for (const r of p.risques) if (r.statut && !STATUTS_RISQUE.includes(r.statut)) erreurs.push(`${r.id} : statut inconnu « ${r.statut} »`);
  for (const a of p.actions) if (a.statut && !STATUTS_ACTION.includes(a.statut)) erreurs.push(`${a.id} : statut inconnu « ${a.statut} »`);
  for (const c of p.changements) {
    if (c.decision && !DECISIONS_CHANGEMENT.includes(c.decision)) erreurs.push(`${c.id} : décision inconnue « ${c.decision} »`);
    for (const f of c.fonctionnalites) if (!fo.has(f)) erreurs.push(`${c.id} : fonctionnalité inconnue ${f}`);
  }
  return { erreurs, avertissements: avert };
}

// Prochain identifiant libre pour un préfixe (F, EX, RT, RC, ADR).
export function prochainId(p: ModeleProjet, prefixe: string): string {
  const sources = { F: p.fonctionnalites, EX: p.exigences, RT: p.tests, RC: p.retours, R: p.risques, A: p.actions, DC: p.changements }[prefixe] || [];
  const max = sources.reduce((m, x) => {
    const n = Number(String(x?.id || '').split('-')[1]);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${prefixe}-${String(max + 1).padStart(3, '0')}`;
}

