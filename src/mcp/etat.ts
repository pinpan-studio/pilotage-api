import { Acteur } from '../common/acteur';
import { LIBELLES } from '../indicateurs/referentiels';
import { statutEffectif } from '../indicateurs/calcul';
import type { Services } from './serveur-mcp';

const pct = (x: number | null | undefined) => (x == null ? '—' : `${Math.round(x * 100)} %`);
const L = (c: string) => LIBELLES[c] ?? c;

/** Résumé de l'état d'un projet : portage de resumeTexte() de scripts/etat.mjs (kit v1). */
export async function etatProjet(a: Acteur, s: Pick<Services, 'acces' | 'ind'>, code: string, depot?: string) {
      const p = await s.acces.projet(a, code);
      const { modele, indicateurs: m } = await s.ind.calculer(p);
      const T: string[] = [];
      T.push(`# État du projet ${p.nom || code} (${code})`);
      T.push(`Client : ${p.client || '—'} · Livraison prévue : ${p.date_livraison_prevue || '—'}`);
      T.push(`Avancement global : ${pct(m.avancement)} · Couverture TDR : ${pct(m.couverture)} · Recette OK : ${pct(m.tauxRecette)} · Retours ouverts : ${m.retoursOuverts.length}`);
      T.push(`Livrables documentaires : ${pct(m.avancementDocuments)} · Risques actifs : ${m.risquesActifs.length} · Actions ouvertes : ${m.actionsOuvertes.length} (dont ${m.actionsEnRetard.length} en retard) · Changements en analyse : ${m.changementsEnAnalyse.length}`);
      if (m.prochainJalon) T.push(`Prochain jalon : ${m.prochainJalon.nom} le ${m.prochainJalon.date_prevue || '?'}${m.prochainJalon.livrables.length ? ` (documents attendus : ${m.prochainJalon.livrables.join(', ')})` : ''}`);
      T.push('');
      const filtre = (f: any) => !depot || !f.depots || depot in f.depots;
      const enCours = modele.fonctionnalites.filter((f: any) => ['en_cours', 'bloque'].includes(statutEffectif(f)));
      const aFaire = modele.fonctionnalites.filter((f: any) => statutEffectif(f) === 'a_faire');
      T.push(`## Fonctionnalités en cours${depot ? ` (dépôt ${depot})` : ''}`);
      for (const f of enCours.filter(filtre)) {
        const d = f.depots ? ' — ' + Object.entries(f.depots).map(([k, v]) => `${k}: ${L(String(v))}`).join(', ') : '';
        T.push(`- ${f.id} ${f.titre} [${L(statutEffectif(f))}]${d}`);
      }
      if (!enCours.length) T.push('- (aucune)');
      T.push('## Prochaines fonctionnalités à faire');
      for (const f of aFaire.filter(filtre).slice(0, 8)) T.push(`- ${f.id} ${f.titre}${f.jalon ? ` (${f.jalon})` : ''}`);
      if (!aFaire.length) T.push('- (aucune)');
      if (m.retoursOuverts.length) {
        T.push('## Retours clients ouverts');
        for (const r of m.retoursOuverts.slice(0, 8))
          T.push(`- ${r.id} [${L(r.type)}, ${L(r.priorite)}] ${(r.corps.match(/## Retour[^\n]*\n+([^\n]+)/) || [])[1] || ''} → ${r.fonctionnalites.join(', ') || 'non rattaché'}`);
      }
      const docs = modele.suiviDocuments.filter((d: any) => ['en_cours', 'en_revue'].includes(d.statut));
      if (docs.length) { T.push('## Documents en cours'); for (const d of docs) T.push(`- ${d.code} ${d.titre} [${L(d.statut)}]${d.version ? ` v${d.version}` : ''}${d.echeance ? ` — échéance ${d.echeance}` : ''}`); }
      if (m.actionsOuvertes.length) { T.push('## Actions ouvertes'); for (const x of m.actionsOuvertes.slice(0, 8)) T.push(`- ${x.id} ${x.action} — ${x.responsable || '?'}${x.echeance ? `, ${x.echeance}` : ''}${m.actionsEnRetard.includes(x) ? ' (EN RETARD)' : ''}`); }
      if (m.alertes.length) { T.push('## Alertes'); for (const x of m.alertes.slice(0, 10)) T.push(`- (${x.niveau}) ${x.texte}`); }
      return {
        texte: T.join('\n'), seuil_rappel_doc: p.seuil_rappel_doc,
        donnees: { avancement: m.avancement, couverture: m.couverture, taux_recette: m.tauxRecette, recette: m.recette, retours_ouverts: m.retoursOuverts.length, alertes: m.alertes },
      };
}
