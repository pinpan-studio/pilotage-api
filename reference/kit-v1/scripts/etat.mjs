#!/usr/bin/env node
// Résumé de l'état d'un projet. Usage : node scripts/etat.mjs <code-projet> [--depot nom] [--json]
import { chargerProjet, calculer, statutEffectif, pct, LIBELLES } from './lib/pilotage.mjs';

export function resumeTexte(code, { depot } = {}) {
  const p = chargerProjet(code);
  const m = calculer(p);
  const L = [];
  L.push(`# État du projet ${p.projet.nom || code} (${code})`);
  L.push(`Client : ${p.projet.client || '—'} · Livraison prévue : ${p.projet.date_livraison_prevue || '—'}`);
  L.push(`Avancement global : ${pct(m.avancement)} · Couverture TDR : ${pct(m.couverture)} · Recette OK : ${pct(m.tauxRecette)} · Retours ouverts : ${m.retoursOuverts.length}`);
  L.push(`Livrables documentaires : ${pct(m.avancementDocuments)} · Risques actifs : ${m.risquesActifs.length} · Actions ouvertes : ${m.actionsOuvertes.length} (dont ${m.actionsEnRetard.length} en retard) · Changements en analyse : ${m.changementsEnAnalyse.length}`);
  if (m.prochainJalon) L.push(`Prochain jalon : ${m.prochainJalon.nom} le ${m.prochainJalon.date_prevue || '?'}${m.prochainJalon.livrables.length ? ` (documents attendus : ${m.prochainJalon.livrables.join(', ')})` : ''}`);
  L.push('');
  const enCours = p.fonctionnalites.filter((f) => ['en_cours', 'bloque'].includes(statutEffectif(f)));
  const aFaire = p.fonctionnalites.filter((f) => statutEffectif(f) === 'a_faire');
  const filtre = (f) => !depot || !f.depots || depot in f.depots;
  L.push(`## Fonctionnalités en cours${depot ? ` (dépôt ${depot})` : ''}`);
  for (const f of enCours.filter(filtre)) {
    const d = f.depots ? ' — ' + Object.entries(f.depots).map(([k, v]) => `${k}: ${LIBELLES[v] || v}`).join(', ') : '';
    L.push(`- ${f.id} ${f.titre} [${LIBELLES[statutEffectif(f)]}]${d}`);
  }
  if (!enCours.length) L.push('- (aucune)');
  L.push(`## Prochaines fonctionnalités à faire`);
  for (const f of aFaire.filter(filtre).slice(0, 8)) L.push(`- ${f.id} ${f.titre}${f.jalon ? ` (${f.jalon})` : ''}`);
  if (!aFaire.length) L.push('- (aucune)');
  if (m.retoursOuverts.length) {
    L.push('## Retours clients ouverts');
    for (const r of m.retoursOuverts.slice(0, 8))
      L.push(`- ${r.id} [${LIBELLES[r.type] || r.type}, ${LIBELLES[r.priorite] || r.priorite}] ${(r.corps.match(/## Retour[^\n]*\n+([^\n]+)/) || [])[1] || ''} → ${r.fonctionnalites.join(', ') || 'non rattaché'}`);
  }
  const docsEnCours = p.suiviDocuments.filter((d) => ['en_cours', 'en_revue'].includes(d.statut));
  if (docsEnCours.length) {
    L.push('## Documents en cours');
    for (const d of docsEnCours) L.push(`- ${d.code} ${d.titre} [${LIBELLES[d.statut]}]${d.version ? ` v${d.version}` : ''}${d.echeance ? ` — échéance ${d.echeance}` : ''}`);
  }
  if (m.actionsOuvertes.length) {
    L.push('## Actions ouvertes');
    for (const a of m.actionsOuvertes.slice(0, 8)) L.push(`- ${a.id} ${a.action} — ${a.responsable || '?'}${a.echeance ? `, ${a.echeance}` : ''}${m.actionsEnRetard.includes(a) ? ' (EN RETARD)' : ''}`);
  }
  if (m.alertes.length) {
    L.push('## Alertes');
    for (const a of m.alertes.slice(0, 10)) L.push(`- (${a.niveau}) ${a.texte}`);
  }
  return { texte: L.join('\n'), p, m };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('etat.mjs')) {
  const args = process.argv.slice(2);
  const code = args.find((a) => !a.startsWith('--'));
  if (!code) { console.error('Usage : node scripts/etat.mjs <code-projet> [--depot nom] [--json]'); process.exit(1); }
  const i = args.indexOf('--depot');
  const { texte, m } = resumeTexte(code, { depot: i >= 0 ? args[i + 1] : undefined });
  if (args.includes('--json')) console.log(JSON.stringify({ avancement: m.avancement, couverture: m.couverture, tauxRecette: m.tauxRecette, recette: m.recette, retoursOuverts: m.retoursOuverts.length, alertes: m.alertes }, null, 2));
  else console.log(texte);
}
