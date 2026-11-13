/** Projection comparable des indicateurs (ignore les champs techniques propres à chaque source). */
export function projection(m: any) {
  const ids = (l: any[]) => (l ?? []).map((x) => x.id);
  return {
    avancement: m.avancement, nbFonctionnalites: m.nbFonctionnalites, parStatut: m.parStatut, parJalon: m.parJalon,
    parDepot: m.parDepot, couverture: m.couverture, exigencesNonCouvertes: ids(m.exigencesNonCouvertes),
    resultatTest: m.resultatTest, recette: m.recette, tauxRecette: m.tauxRecette, retoursOuverts: ids(m.retoursOuverts),
    delaiMoyenResolution: m.delaiMoyenResolution, activiteParJour: m.activiteParJour, derniereActivite: m.derniereActivite,
    derniereActiviteFonc: m.derniereActiviteFonc, commits: (m.commits ?? []).map((c: any) => [c.ts, c.hash]),
    testsParFonc: Object.fromEntries(Object.entries(m.testsParFonc ?? {}).map(([k, v]: any) => [k, ids(v)])),
    avancementDocuments: m.avancementDocuments, parPhase: m.parPhase,
    jalons: (m.jalons ?? []).map((j: any) => ({ id: j.id, statut: j.statut, ecart: j.ecart, livrables: j.livrables })),
    prochainJalon: m.prochainJalon?.id ?? null,
    risques: (m.risques ?? []).map((r: any) => [r.id, r.criticite]), risquesActifs: ids(m.risquesActifs),
    actionsOuvertes: ids(m.actionsOuvertes), actionsEnRetard: ids(m.actionsEnRetard), changementsEnAnalyse: ids(m.changementsEnAnalyse),
    alertes: m.alertes,
  };
}
