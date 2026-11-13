#!/usr/bin/env node
// Génère le tableau de bord statique (dist/) à partir de tous les projets de projets/.
import { mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { marked } from 'marked';
import { RACINE, listerProjets, chargerProjet, calculer, verifier, statutEffectif, avancementFonctionnalite, pct, LIBELLES } from './lib/pilotage.mjs';

const DIST = join(RACINE, 'dist');
const MAINTENANT = new Date();
const AUJ = MAINTENANT.toISOString().slice(0, 10);

// ------------------------------------------------------------ utilitaires HTML
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const lib = (s) => LIBELLES[s] || s || '—';
const badge = (s, extra = '') => `<span class="badge b-${esc(s || 'vide')}${extra}">${esc(lib(s))}</span>`;
const barre = (x, cls = '') => `<div class="barre ${cls}" role="progressbar" aria-valuenow="${Math.round((x || 0) * 100)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.round((x || 0) * 100)}%"></span></div>`;
const dateFr = (d) => (d ? new Date(d.length === 10 ? d + 'T12:00:00Z' : d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const dateHeureFr = (d) => (d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : '—');
const ilYa = (ts) => {
  if (!ts) return 'jamais';
  const j = Math.floor((MAINTENANT - new Date(ts)) / 86400000);
  return j <= 0 ? "aujourd'hui" : j === 1 ? 'hier' : `il y a ${j} j`;
};
marked.setOptions({ gfm: true });
const md = (t) => marked.parse(String(t || '')).replace(/href="(?!https?:|#|mailto:)([^"]+?)\.md(#[^"]*)?"/g, 'href="$1.html$2"');

function page({ titre, profondeur = 0, fil = [], onglets = '', contenu }) {
  const r = '../'.repeat(profondeur);
  const ariane = fil.length
    ? `<nav class="ariane"><a href="${r}index.html">Portefeuille</a>${fil.map(([t, h]) => ` <span>›</span> ${h ? `<a href="${h}">${esc(t)}</a>` : esc(t)}`).join('')}</nav>`
    : '';
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(titre)} — Pilotage</title>
<link rel="stylesheet" href="${r}assets/style.css">
</head>
<body>
<header class="entete"><div class="conteneur">
  <a class="marque" href="${r}index.html"><span class="logo" aria-hidden="true">◧</span> Pilotage des projets</a>
  <span class="maj">Mis à jour le ${dateHeureFr(MAINTENANT.toISOString())} UTC</span>
</div></header>
<main class="conteneur">
${ariane}
${onglets}
${contenu}
</main>
<footer class="conteneur pied">Généré automatiquement à partir des dépôts de pilotage · données issues des fichiers YAML/Markdown et du journal des agents.</footer>
</body>
</html>`;
}

function ecrire(chemin, html) {
  const c = join(DIST, chemin);
  mkdirSync(dirname(c), { recursive: true });
  writeFileSync(c, html);
}

const tuile = (valeur, libelle, detail = '', cls = '') =>
  `<div class="tuile ${cls}"><div class="valeur">${valeur}</div><div class="libelle">${esc(libelle)}</div>${detail ? `<div class="detail">${detail}</div>` : ''}</div>`;

function activiteSvg(parJour, jours = 30) {
  const liste = [];
  for (let i = jours - 1; i >= 0; i--) {
    const d = new Date(MAINTENANT - i * 86400000).toISOString().slice(0, 10);
    liste.push([d, parJour[d] || 0]);
  }
  const max = Math.max(1, ...liste.map((x) => x[1]));
  const L = 8, E = 3, H = 48;
  const barres = liste
    .map(([d, n], i) => {
      const h = n ? Math.max(2, Math.round((n / max) * H)) : 1;
      return `<rect x="${i * (L + E)}" y="${H - h}" width="${L}" height="${h}" rx="1.5" class="${n ? 'act' : 'vide'}"><title>${dateFr(d)} : ${n} action(s)</title></rect>`;
    })
    .join('');
  const total = liste.reduce((a, x) => a + x[1], 0);
  return `<figure class="activite"><svg viewBox="0 0 ${jours * (L + E) - E} ${H}" preserveAspectRatio="none" role="img" aria-label="Activité des 30 derniers jours : ${total} actions">${barres}</svg>
  <figcaption><span>il y a 30 j</span><span>${total} actions enregistrées sur 30 jours</span><span>aujourd'hui</span></figcaption></figure>`;
}

const ORDRE_STATUTS = ['valide', 'recette', 'developpe', 'en_cours', 'bloque', 'a_faire', 'abandonne'];
function repartition(parStatut) {
  const total = Object.values(parStatut).reduce((a, b) => a + b, 0) || 1;
  const segs = ORDRE_STATUTS.filter((s) => parStatut[s])
    .map((s) => `<span class="seg s-${s}" style="flex:${parStatut[s]}" title="${esc(lib(s))} : ${parStatut[s]}"></span>`)
    .join('');
  const leg = ORDRE_STATUTS.filter((s) => parStatut[s])
    .map((s) => `<li><i class="pastille s-${s}"></i>${esc(lib(s))} <b>${parStatut[s]}</b></li>`)
    .join('');
  return `<div class="repartition" aria-label="Répartition des fonctionnalités par statut sur ${total}">${segs}</div><ul class="legende">${leg}</ul>`;
}

// ------------------------------------------------------------ pages projet
function onglets(code, actif, p, m) {
  const items = [
    ['index', 'Synthèse'],
    ['fonctionnalites', `Fonctionnalités <small>${m.nbFonctionnalites}</small>`],
    ['tracabilite', 'Traçabilité'],
    ['recette', `Recette <small>${p.tests.length}</small>`],
    ['retours', `Retours clients <small>${m.retoursOuverts.length ? m.retoursOuverts.length + ' ouverts' : p.retours.length}</small>`],
    ['gestion', `Gestion <small>${m.actionsOuvertes.length} actions</small>`],
    ['livrables', `Livrables <small>${pct(m.avancementDocuments)}</small>`],
    ['journal', 'Journal'],
  ];
  return `<nav class="onglets">${items.map(([k, t]) => `<a href="${k}.html"${k === actif ? ' class="actif" aria-current="page"' : ''}>${t}</a>`).join('')}</nav>`;
}

function enteteProjet(p, m) {
  const pj = p.projet;
  return `<section class="titre-projet">
  <div><h1>${esc(pj.nom || p.code)}</h1>
  <p class="sous">${esc(pj.client || '')}${pj.chef_projet ? ` · Chef de projet : ${esc(pj.chef_projet)}` : ''} · ${badge(pj.statut || 'en_cours')}</p></div>
  <div class="dates"><div><span>Début</span>${dateFr(pj.date_debut)}</div><div><span>Livraison prévue</span>${dateFr(pj.date_livraison_prevue)}</div></div>
</section>`;
}

function pageSynthese(p, m) {
  const recetteDetail = p.tests.length ? `${m.recette.ok} OK · ${m.recette.ko} KO · ${m.recette.reserve} réserve(s) · ${m.recette.non_teste} non testé(s)` : 'aucun cas de test';
  const tuiles = `<section class="tuiles">
    ${tuile(pct(m.avancement), 'Avancement global', barre(m.avancement), 'principale')}
    ${tuile(pct(m.couverture), 'Couverture du TDR', `${p.exigences.length - m.exigencesNonCouvertes.length}/${p.exigences.length} exigences couvertes`)}
    ${tuile(pct(m.tauxRecette), 'Tests de recette OK', recetteDetail)}
    ${tuile(pct(m.avancementDocuments), 'Livrables documentaires', `${barre(m.avancementDocuments)}<div style="margin-top:6px"><a href="livrables.html">Voir les livrables →</a></div>`)}
    ${tuile(m.prochainJalon ? dateFr(m.prochainJalon.date_prevue) : '—', 'Prochain jalon', m.prochainJalon ? esc(m.prochainJalon.nom) : '', 'texte')}
    ${tuile(String(m.retoursOuverts.length), 'Retours clients ouverts', `${p.retours.length} au total${m.delaiMoyenResolution != null ? ` · résolution moy. ${Math.round(m.delaiMoyenResolution)} j` : ''}`, m.retoursOuverts.some((r) => r.priorite === 'haute') ? 'attention' : '')}
  </section>`;

  const alertes = m.alertes.length
    ? `<ul class="alertes">${m.alertes.map((a) => `<li class="n-${a.niveau}"><b>${esc(a.niveau === 'haute' ? 'Important' : a.niveau === 'moyenne' ? 'À surveiller' : 'Info')}</b> ${esc(a.texte)}</li>`).join('')}</ul>`
    : '<p class="vide">Aucune alerte.</p>';

  const jalons = m.parJalon.map((j) => `<div class="ligne-barre"><span>${esc(j.nom)} <small>${j.nb} fonct.</small></span>${barre(j.avancement)}<b>${pct(j.avancement)}</b></div>`).join('');
  const depots = m.parDepot.map((d) => `<div class="ligne-barre"><span>${esc(d.nom)} <small>${d.nb} fonct.</small></span>${barre(d.avancement, 'dev')}<b>${pct(d.avancement)}</b></div>`).join('');

  const sessions = p.sessions.slice(0, 3).map((s) => `<li><b>${dateFr(s.date)}</b> · ${esc(s.depot || '')} · ${esc(s.auteur || '')}<div class="extrait">${esc(((s.corps.match(/## Réalisé\s*\n([\s\S]*?)(\n## |$)/) || [])[1] || '').trim().split('\n').slice(0, 3).join(' ').replace(/^- /gm, '').slice(0, 220))}</div></li>`).join('');

  return page({
    titre: p.projet.nom || p.code,
    profondeur: 2,
    fil: [[p.projet.nom || p.code]],
    onglets: enteteProjet(p, m) + onglets(p.code, 'index', p, m),
    contenu: `${tuiles}
<div class="grille">
  <section class="carte"><h2>Alertes</h2>${alertes}</section>
  <section class="carte"><h2>Fonctionnalités par statut</h2>${repartition(m.parStatut)}</section>
  <section class="carte"><h2>Avancement par lot</h2>${jalons || '<p class="vide">—</p>'}</section>
  <section class="carte"><h2>Développement par dépôt</h2>${depots || '<p class="vide">Aucun dépôt déclaré.</p>'}<p class="note">Part du développement terminé dans chaque dépôt (hors recette).</p></section>
  <section class="carte large"><h2>Activité des agents et de l'équipe</h2>${activiteSvg(m.activiteParJour)}<p class="note">Dernière activité : ${ilYa(m.derniereActivite)} · ${m.commits.length} commit(s) journalisé(s).</p></section>
  <section class="carte large"><h2>Dernières sessions</h2>${sessions ? `<ul class="sessions">${sessions}</ul><p><a href="journal.html">Tout le journal →</a></p>` : '<p class="vide">Aucune session enregistrée (commande /fin-session).</p>'}</section>
</div>`,
  });
}

function pageFonctionnalites(p, m) {
  const depots = m.parDepot.map((d) => d.nom);
  const lignes = p.fonctionnalites
    .map((f) => {
      const s = statutEffectif(f);
      const ts = m.testsParFonc[f.id] || [];
      const ok = ts.filter((t) => m.resultatTest[t.id]?.resultat === 'ok').length;
      const ko = ts.filter((t) => m.resultatTest[t.id]?.resultat === 'ko').length;
      const tests = ts.length ? `${ok}/${ts.length}${ko ? ` <span class="ko">${ko} KO</span>` : ''}` : '<span class="mute">—</span>';
      const cells = depots.map((d) => `<td>${f.depots && d in f.depots ? badge(f.depots[d], ' petit') : '<span class="mute">·</span>'}</td>`).join('');
      return `<tr id="${esc(f.id)}"${s === 'abandonne' ? ' class="barre-texte"' : ''}>
  <td class="id">${esc(f.id)}</td>
  <td><b>${esc(f.titre)}</b>${f.notes ? `<div class="note">${esc(f.notes)}</div>` : ''}${f.origine && f.origine !== 'TDR' ? `<div class="note">Origine : ${esc(f.origine)}</div>` : ''}</td>
  <td class="nowrap">${esc(f.jalon || '')}</td>
  <td>${(f.exigences || []).map((e) => `<span class="ref">${esc(e)}</span>`).join(' ')}</td>
  <td class="num">${esc(f.poids || 1)}</td>
  <td>${badge(s)}</td>
  ${cells}
  <td class="avc">${barre(avancementFonctionnalite(f))}<small>${pct(avancementFonctionnalite(f))}</small></td>
  <td>${tests}</td>
  <td class="mute">${ilYa(m.derniereActiviteFonc[f.id])}</td>
</tr>`;
    })
    .join('');
  return page({
    titre: `Fonctionnalités — ${p.projet.nom}`,
    profondeur: 2,
    fil: [[p.projet.nom || p.code, 'index.html'], ['Fonctionnalités']],
    onglets: enteteProjet(p, m) + onglets(p.code, 'fonctionnalites', p, m),
    contenu: `<section class="carte"><div class="defile"><table class="tableau">
<thead><tr><th>Id</th><th>Fonctionnalité</th><th>Lot</th><th>Exigences</th><th class="num">Poids</th><th>Statut</th>${depots.map((d) => `<th>${esc(d)}</th>`).join('')}<th>Avancement</th><th>Tests OK</th><th>Activité</th></tr></thead>
<tbody>${lignes || '<tr><td colspan="9" class="vide">Aucune fonctionnalité (lancer /init-projet).</td></tr>'}</tbody></table></div>
<p class="note">Avancement pondéré : à faire 0 % · en cours / bloqué 30 % · développé 70 % · recetté 90 % · validé client 100 %. Avec plusieurs dépôts, on fait la moyenne des statuts par dépôt.</p></section>`,
  });
}

function pageTracabilite(p, m) {
  const lignes = p.exigences
    .map((e) => {
      const fs = p.fonctionnalites.filter((f) => (f.exigences || []).includes(e.id) && f.statut !== 'abandonne');
      const tests = fs.flatMap((f) => m.testsParFonc[f.id] || []);
      const retours = p.retours.filter((r) => r.fonctionnalites.some((x) => fs.some((f) => f.id === x)));
      return `<tr${fs.length ? '' : ' class="alerte-ligne"'}>
  <td class="id">${esc(e.id)}</td>
  <td><b>${esc(e.titre)}</b><div class="note">${esc(e.section_tdr || '')}</div></td>
  <td>${badge(e.priorite)}</td>
  <td>${fs.length ? fs.map((f) => `<div><a href="fonctionnalites.html#${esc(f.id)}" class="ref">${esc(f.id)}</a> ${badge(statutEffectif(f), ' petit')}</div>`).join('') : '<span class="ko">non couverte</span>'}</td>
  <td>${tests.map((t) => `<span class="ref r-${esc(m.resultatTest[t.id]?.resultat || 'non_teste')}" title="${esc(t.titre)} : ${esc(lib(m.resultatTest[t.id]?.resultat || 'non_teste'))}">${esc(t.id)}</span>`).join(' ') || '<span class="mute">—</span>'}</td>
  <td>${retours.map((r) => `<a class="ref" href="retours.html#${esc(r.id)}">${esc(r.id)}</a>`).join(' ') || '<span class="mute">—</span>'}</td>
</tr>`;
    })
    .join('');
  const horsTdr = p.fonctionnalites.filter((f) => !(f.exigences || []).length);
  return page({
    titre: `Traçabilité — ${p.projet.nom}`,
    profondeur: 2,
    fil: [[p.projet.nom || p.code, 'index.html'], ['Traçabilité']],
    onglets: enteteProjet(p, m) + onglets(p.code, 'tracabilite', p, m),
    contenu: `<section class="carte"><h2>Exigences du TDR → fonctionnalités → tests → retours</h2><div class="defile"><table class="tableau">
<thead><tr><th>Exigence</th><th>Intitulé</th><th>Priorité</th><th>Fonctionnalités</th><th>Tests (dernier résultat)</th><th>Retours</th></tr></thead>
<tbody>${lignes || '<tr><td colspan="6" class="vide">Aucune exigence (lancer /init-projet).</td></tr>'}</tbody></table></div>
<p class="note">Couleur des tests : vert = OK, rouge = KO, orange = réserve, gris = non testé.</p>
${horsTdr.length ? `<h3>Fonctionnalités hors TDR</h3><ul>${horsTdr.map((f) => `<li><span class="ref">${esc(f.id)}</span> ${esc(f.titre)} — origine ${esc(f.origine || 'interne')}</li>`).join('')}</ul>` : ''}
</section>`,
  });
}

function pageRecette(p, m) {
  const camp = [...p.campagnes].reverse();
  const campagnes = camp
    .map((c) => {
      const n = { ok: 0, ko: 0, reserve: 0, non_teste: 0 };
      for (const r of c.resultats) n[r.resultat || 'non_teste'] = (n[r.resultat || 'non_teste'] || 0) + 1;
      return `<tr><td class="id">${esc(c.id)}</td><td><b>${esc(c.titre || '')}</b><div class="note">${esc(c.environnement || '')} · ${esc((c.testeurs || []).join(', '))}</div></td><td>${badge(c.type === 'client' ? 'client' : 'interne')}</td><td>${dateFr(c.date)}</td>
      <td><span class="r-ok ref">${n.ok} OK</span> <span class="r-ko ref">${n.ko} KO</span> <span class="r-reserve ref">${n.reserve} rés.</span> <span class="r-non_teste ref">${n.non_teste} n.t.</span></td></tr>`;
    })
    .join('');
  const tests = p.tests
    .map((t) => {
      const r = m.resultatTest[t.id] || { resultat: 'non_teste' };
      return `<tr><td class="id">${esc(t.id)}</td><td><a class="ref" href="fonctionnalites.html#${esc(t.fonctionnalite)}">${esc(t.fonctionnalite)}</a></td>
      <td><details><summary><b>${esc(t.titre)}</b></summary>${t.preconditions ? `<p><i>Préconditions :</i> ${esc(t.preconditions)}</p>` : ''}<ol>${(t.etapes || []).map((e) => `<li>${esc(e)}</li>`).join('')}</ol><p><i>Résultat attendu :</i> ${esc(t.attendu || '')}</p></details></td>
      <td>${badge(r.resultat)}${r.campagne ? ` <small class="mute">${esc(r.campagne)}</small>` : ''}</td><td class="note">${esc(r.commentaire || '')}</td></tr>`;
    })
    .join('');
  return page({
    titre: `Recette — ${p.projet.nom}`,
    profondeur: 2,
    fil: [[p.projet.nom || p.code, 'index.html'], ['Recette']],
    onglets: enteteProjet(p, m) + onglets(p.code, 'recette', p, m),
    contenu: `<section class="tuiles">
  ${tuile(pct(m.tauxRecette), 'Tests OK', barre(m.tauxRecette))}
  ${tuile(String(m.recette.ko), 'Tests KO', '', m.recette.ko ? 'attention' : '')}
  ${tuile(String(m.recette.reserve), 'Réserves')}
  ${tuile(String(m.recette.non_teste), 'Non testés')}
</section>
<section class="carte"><h2>Campagnes</h2><div class="defile"><table class="tableau"><thead><tr><th>Id</th><th>Campagne</th><th>Type</th><th>Date</th><th>Résultats</th></tr></thead><tbody>${campagnes || '<tr><td colspan="5" class="vide">Aucune campagne (commande /recette campagne).</td></tr>'}</tbody></table></div></section>
<section class="carte"><h2>Cahier de recette</h2><p class="note">Résultat retenu = dernière campagne ayant exécuté le test. Cliquer sur un test pour voir les étapes.</p><div class="defile"><table class="tableau"><thead><tr><th>Id</th><th>Fonct.</th><th>Cas de test</th><th>Résultat</th><th>Commentaire</th></tr></thead><tbody>${tests || '<tr><td colspan="5" class="vide">Aucun cas de test (commande /recette).</td></tr>'}</tbody></table></div></section>`,
  });
}

function pageRetours(p, m) {
  const parType = {};
  for (const r of p.retours) parType[r.type || 'remarque'] = (parType[r.type || 'remarque'] || 0) + 1;
  const liste = p.retours
    .map((r) => `<article class="retour" id="${esc(r.id)}">
  <header><span class="id">${esc(r.id)}</span> ${badge(r.statut || 'nouveau')} ${badge(r.type)} ${badge(r.priorite)}
  <span class="mute">${dateFr(r.date)} · ${esc(r.source || '')} · ${esc(r.contact_client || '')} · saisi par ${esc(r.saisi_par || '—')}</span>
  ${r.fonctionnalites.map((f) => `<a class="ref" href="fonctionnalites.html#${esc(f)}">${esc(f)}</a>`).join(' ')}
  ${r.date_resolution ? `<span class="mute">· résolu le ${dateFr(r.date_resolution)}</span>` : ''}</header>
  <details${['nouveau', 'en_cours'].includes(r.statut || 'nouveau') ? ' open' : ''}><summary>Détail</summary><div class="prose">${md(r.corps)}</div></details>
</article>`)
    .join('');
  return page({
    titre: `Retours clients — ${p.projet.nom}`,
    profondeur: 2,
    fil: [[p.projet.nom || p.code, 'index.html'], ['Retours clients']],
    onglets: enteteProjet(p, m) + onglets(p.code, 'retours', p, m),
    contenu: `<section class="tuiles">
  ${tuile(String(m.retoursOuverts.length), 'Ouverts', '', m.retoursOuverts.length ? 'attention' : '')}
  ${tuile(String(p.retours.filter((r) => r.statut === 'resolu').length), 'Résolus')}
  ${tuile(m.delaiMoyenResolution != null ? `${Math.round(m.delaiMoyenResolution)} j` : '—', 'Délai moyen de résolution')}
  ${tuile(Object.entries(parType).map(([k, v]) => `${v} ${lib(k).toLowerCase()}`).join(' · ') || '—', 'Par type', '', 'texte')}
</section>
<section class="carte">${liste || '<p class="vide">Aucun retour enregistré (commande /retour-client).</p>'}</section>`,
  });
}

function pageJournal(p, m) {
  const sessions = p.sessions
    .map((s) => `<article class="session"><header><b>${dateFr(s.date)}</b> · ${esc(s.depot || '')} · ${esc(s.auteur || '')} ${(s.fonctionnalites || []).map((f) => `<a class="ref" href="fonctionnalites.html#${esc(f)}">${esc(f)}</a>`).join(' ')}</header><details><summary>Lire le résumé</summary><div class="prose">${md(s.corps)}</div></details></article>`)
    .join('');
  const libEvt = { modification: 'Modification', creation: 'Création', commit: 'Commit', commande: 'Commande', doc: 'Doc mise à jour', agent: 'Sous-agent' };
  const actions = [...p.journal].reverse().slice(0, 150)
    .map((e) => `<tr><td class="mute">${dateHeureFr(e.ts)}</td><td>${esc(e.depot || '')}</td><td>${esc(e.auteur || '')}</td><td><span class="evt e-${esc(e.evt)}">${esc(libEvt[e.evt] || e.evt)}</span></td>
    <td class="code">${esc(e.evt === 'commit' ? `${e.hash || ''} ${e.message || ''}` : e.evt === 'commande' ? e.commande : e.evt === 'agent' ? `${e.agent} — ${e.description || ''}` : e.fichier || '')}</td></tr>`)
    .join('');
  return page({
    titre: `Journal — ${p.projet.nom}`,
    profondeur: 2,
    fil: [[p.projet.nom || p.code, 'index.html'], ['Journal']],
    onglets: enteteProjet(p, m) + onglets(p.code, 'journal', p, m),
    contenu: `<section class="carte"><h2>Activité (30 jours)</h2>${activiteSvg(m.activiteParJour)}</section>
<section class="carte"><h2>Sessions de travail</h2>${sessions || '<p class="vide">Aucune session (commande /fin-session).</p>'}</section>
<section class="carte"><h2>Actions enregistrées automatiquement</h2><p class="note">${p.journal.length} actions au total, enregistrées par les hooks Claude Code. 150 plus récentes affichées.</p>
<div class="defile"><table class="tableau compact"><thead><tr><th>Date (UTC)</th><th>Dépôt</th><th>Auteur</th><th>Action</th><th>Détail</th></tr></thead><tbody>${actions || '<tr><td colspan="5" class="vide">Journal vide.</td></tr>'}</tbody></table></div></section>`,
  });
}

const TITRES_DOSSIERS = { '00-cadrage': 'Cadrage', '02-technique': 'Documentation technique', '06-rapports': "Rapports d'avancement", '08-livrables': 'Livrables', '': 'Général' };

function lienDocument(p, d) {
  const liens = [];
  const f = d.fichier || '';
  if (f.endsWith('.md') && d.existe && p.fichiersMd.includes(f)) liens.push(`<a href="docs/${esc(f.replace(/\.md$/, '.html'))}">Ouvrir</a>`);
  else if (f.endsWith('/') && d.nbFichiers) liens.push(`<span class="mute">${d.nbFichiers} fichier(s)</span>`);
  else if (f.startsWith('04-recette/')) liens.push('<a href="recette.html">Voir</a>');
  else if (f.startsWith('07-gestion/')) liens.push('<a href="gestion.html">Voir</a>');
  else if (d.existe && !d.lien) liens.push(`<span class="mute code">${esc(f)}</span>`);
  if (d.lien && /^https?:\/\//.test(d.lien)) liens.push(`<a href="${esc(d.lien)}" target="_blank" rel="noopener">Lien externe ↗</a>`);
  for (const sc of d.scans) liens.push(`<span class="ref" title="${esc(sc)}">scan signé</span>`);
  return liens.join(' · ') || '<span class="mute">—</span>';
}

function pageLivrables(p, m, indexAutres) {
  const jalonDe = {};
  for (const j of m.jalons) for (const c of j.livrables) jalonDe[c] = j;
  const actifs = p.suiviDocuments.filter((d) => d.statut !== 'sans_objet');
  const enRetard = actifs.filter((d) => { const e = d.echeance || jalonDe[d.code]?.date_prevue; return e && e < AUJ && !['valide', 'signe'].includes(d.statut); });
  const sections = (p.catalogue.phases.length ? p.catalogue.phases : [{ code: 'pilotage', titre: 'Pilotage' }]).map((ph) => {
    const l = p.suiviDocuments.filter((d) => d.phase === ph.code);
    if (!l.length) return '';
    const st = m.parPhase.find((x) => x.code === ph.code);
    const lignes = l.map((d) => {
      const ech = d.echeance || jalonDe[d.code]?.date_prevue || '';
      const retard = enRetard.includes(d);
      return `<tr${d.statut === 'sans_objet' ? ' class="barre-texte"' : ''}>
  <td class="id">${esc(d.code)}</td>
  <td><b>${esc(d.titre)}</b>${d.description ? `<div class="note">${esc(d.description)}</div>` : ''}${d.notes ? `<div class="note">${esc(d.notes)}</div>` : ''}</td>
  <td>${badge(d.producteur || 'humain', ' petit')}</td>
  <td class="nowrap">${d.livrable ? '<span class="ref">livrable</span>' : ''} ${d.signature ? '<span class="ref">à signer</span>' : ''}</td>
  <td>${badge(d.statut)}${d.version ? ` <small>v${esc(d.version)}</small>` : ''}</td>
  <td class="nowrap${retard ? ' ko' : ''}">${ech ? dateFr(ech) : '<span class="mute">—</span>'}${jalonDe[d.code] && !d.echeance ? `<div class="note">${esc(jalonDe[d.code].nom)}</div>` : ''}</td>
  <td>${esc(d.responsable || '')}</td>
  <td>${lienDocument(p, d)}</td>
</tr>`;
    }).join('');
    return `<section class="carte"><div class="titre-section"><h2>${esc(ph.titre)}</h2><span>${st ? `${st.finalises}/${st.nb} validés · ${pct(st.avancement)}` : ''}</span></div>${st ? barre(st.avancement) : ''}
<div class="defile"><table class="tableau"><thead><tr><th>Code</th><th>Document</th><th>Rédaction</th><th></th><th>Statut</th><th>Échéance</th><th>Responsable</th><th>Accès</th></tr></thead><tbody>${lignes}</tbody></table></div></section>`;
  }).join('');
  return page({
    titre: `Livrables — ${p.projet.nom}`,
    profondeur: 2,
    fil: [[p.projet.nom || p.code, 'index.html'], ['Livrables']],
    onglets: enteteProjet(p, m) + onglets(p.code, 'livrables', p, m),
    contenu: `<section class="tuiles">
  ${tuile(pct(m.avancementDocuments), 'Livrables contractuels produits', barre(m.avancementDocuments))}
  ${tuile(String(actifs.filter((d) => ['valide', 'signe'].includes(d.statut)).length), 'Documents validés ou signés', `sur ${actifs.length} requis`)}
  ${tuile(String(actifs.filter((d) => d.statut === 'en_revue').length), 'En revue chez le client')}
  ${tuile(String(enRetard.length), 'Documents en retard', '', enRetard.length ? 'attention' : '')}
</section>
<p class="note">Rédaction : « Agent » = rédigé par l'agent à partir des données du projet · « Agent + humain » = brouillon de l'agent complété et validé par l'équipe · « Humain » = document externe référencé. Commande : <code>/document CODE</code>.</p>
${sections}
<h2 class="sous-titre">Tous les documents du dépôt</h2>
${indexAutres || '<p class="vide">Aucun document.</p>'}`,
  });
}

function matriceRisques(risques) {
  const cell = (pr, im) => {
    const l = risques.filter((r) => Number(r.probabilite) === pr && Number(r.impact) === im);
    const c = pr * im;
    return `<td class="m-${c >= 9 ? 'haute' : c >= 4 ? 'moyenne' : 'basse'}">${l.map((r) => `<span class="ref" title="${esc(r.titre)}">${esc(r.id)}</span>`).join(' ')}</td>`;
  };
  let h = '<table class="matrice" aria-label="Matrice des risques probabilité × impact"><tbody>';
  for (let pr = 4; pr >= 1; pr--) h += `<tr><th>${pr}</th>${[1, 2, 3, 4].map((im) => cell(pr, im)).join('')}</tr>`;
  return h + '<tr><th></th><th>1</th><th>2</th><th>3</th><th>4</th></tr></tbody></table><p class="note">Vertical : probabilité · horizontal : impact.</p>';
}

function pageGestion(p, m) {
  const jalons = m.jalons.map((j) => `<tr><td class="id">${esc(j.id || '')}</td><td><b>${esc(j.nom)}</b>${j.lot ? `<div class="note">${esc(j.lot)}</div>` : ''}</td><td class="nowrap">${dateFr(j.date_prevue)}</td><td class="nowrap">${j.date_reelle ? dateFr(j.date_reelle) : '<span class="mute">—</span>'}</td>
<td>${badge(j.statut)}${j.ecart ? ` <small class="${j.ecart > 0 ? 'ko' : ''}">${j.ecart > 0 ? '+' : ''}${j.ecart} j</small>` : ''}</td>
<td>${j.livrables.map((c) => { const d = p.suiviDocuments.find((x) => x.code === c); return `<span class="ref r-${d && ['valide', 'signe'].includes(d.statut) ? 'ok' : 'non_teste'}" title="${esc(d?.titre || c)} : ${esc(lib(d?.statut))}">${esc(c)}</span>`; }).join(' ')}</td><td>${esc(j.facturation || '')}</td></tr>`).join('');
  const risques = m.risques.map((r) => `<tr class="${['clos'].includes(r.statut) ? 'barre-texte' : ''}"><td class="id">${esc(r.id)}</td><td><b>${esc(r.titre)}</b><div class="note">Parade : ${esc(r.parade || '—')}</div></td><td>${esc(r.categorie || '')}</td><td class="num"><span class="crit c-${r.criticite >= 9 ? 'haute' : r.criticite >= 4 ? 'moyenne' : 'basse'}">${r.criticite}</span></td><td>${badge(r.statut || 'ouvert')}</td><td>${esc(r.responsable || '')}</td></tr>`).join('');
  const actions = [...p.actions].sort((a, b) => (['fait', 'annule'].includes(a.statut) - ['fait', 'annule'].includes(b.statut)) || (a.echeance || '9').localeCompare(b.echeance || '9'))
    .map((a) => `<tr class="${['fait', 'annule'].includes(a.statut) ? 'termine' : ''}"><td class="id">${esc(a.id)}</td><td>${esc(a.action)}</td><td>${esc(a.responsable || '')}</td><td class="nowrap${m.actionsEnRetard.includes(a) ? ' ko' : ''}">${dateFr(a.echeance)}</td><td>${badge(a.statut || 'a_faire')}</td><td class="note">${a.origine && /reunions\//.test(a.origine) ? `<a href="#${esc(a.origine.split('/').pop().replace('.md', ''))}">CR</a>` : a.origine && /RC-/.test(a.origine) ? `<a href="retours.html#${esc((a.origine.match(/RC-\d+/) || [''])[0])}">${esc((a.origine.match(/RC-\d+/) || [''])[0])}</a>` : esc(a.origine || '')}</td></tr>`).join('');
  const changements = p.changements.map((c) => `<tr><td class="id">${esc(c.id)}</td><td><b>${esc(c.titre)}</b>${c.description ? `<div class="note">${esc(c.description)}</div>` : ''}</td><td>${esc(c.demandeur || '')}<div class="note">${dateFr(c.date)}${c.origine ? ` · ${esc(c.origine)}` : ''}</div></td><td>${c.impact_delai_jours != null && c.impact_delai_jours !== '' ? `${esc(c.impact_delai_jours)} j` : '—'}<div class="note">${esc(c.impact_cout || '')}</div></td><td>${badge(c.decision || 'en_analyse')}${c.avenant ? `<div class="note">Avenant ${esc(c.avenant)}</div>` : ''}</td><td>${c.fonctionnalites.map((f) => `<a class="ref" href="fonctionnalites.html#${esc(f)}">${esc(f)}</a>`).join(' ')}</td></tr>`).join('');
  const reunions = p.reunions.map((r) => `<article class="session" id="${esc(r.__fichier.split('/').pop().replace('.md', ''))}"><header><b>${dateFr(r.date)}</b> ${badge(r.type || 'autre')} <span class="mute">${esc(r.lieu || '')} · ${r.participants.length} participant(s)</span></header><details><summary>Lire le compte rendu</summary><div class="prose">${md(r.corps)}<p class="note">Participants : ${esc(r.participants.join(' ; '))}</p></div></details></article>`).join('');
  const pp = p.partiesPrenantes.map((x) => `<tr><td><b>${esc(x.nom || '')}</b><div class="note">${esc(x.fonction || '')}</div></td><td>${esc(x.organisme || '')}</td><td>${esc((x.role || '').replace('_', ' '))}</td><td>${badge(x.influence || '')}</td><td class="note">${esc(x.attentes || '')}</td></tr>`).join('');
  const vide = (t) => `<p class="vide">${t}</p>`;
  return page({
    titre: `Gestion — ${p.projet.nom}`,
    profondeur: 2,
    fil: [[p.projet.nom || p.code, 'index.html'], ['Gestion']],
    onglets: enteteProjet(p, m) + onglets(p.code, 'gestion', p, m),
    contenu: `<section class="tuiles">
  ${tuile(m.prochainJalon ? dateFr(m.prochainJalon.date_prevue) : '—', 'Prochain jalon', m.prochainJalon ? esc(m.prochainJalon.nom) : '', 'texte')}
  ${tuile(String(m.risquesActifs.filter((r) => r.criticite >= 9 || r.statut === 'survenu').length), 'Risques critiques ou survenus', `${m.risquesActifs.length} risques actifs`, m.risquesActifs.some((r) => r.criticite >= 9 || r.statut === 'survenu') ? 'attention' : '')}
  ${tuile(String(m.actionsOuvertes.length), 'Actions ouvertes', `${m.actionsEnRetard.length} en retard`, m.actionsEnRetard.length ? 'attention' : '')}
  ${tuile(String(m.changementsEnAnalyse.length), 'Demandes de changement en analyse', `${p.changements.length} au total`)}
</section>
<section class="carte"><h2>Planning et jalons</h2>${jalons ? `<div class="defile"><table class="tableau"><thead><tr><th>Id</th><th>Jalon</th><th>Prévu</th><th>Réel</th><th>Statut</th><th>Documents attendus</th><th>Paiement</th></tr></thead><tbody>${jalons}</tbody></table></div>` : vide('Aucun jalon (07-gestion/planning.yaml).')}</section>
<div class="grille">
<section class="carte"><h2>Matrice des risques actifs</h2>${matriceRisques(m.risquesActifs)}</section>
<section class="carte"><h2>Registre des risques</h2>${risques ? `<div class="defile"><table class="tableau compact"><thead><tr><th>Id</th><th>Risque</th><th>Cat.</th><th class="num">Crit.</th><th>Statut</th><th>Resp.</th></tr></thead><tbody>${risques}</tbody></table></div>` : vide('Aucun risque (/registre risque).')}</section>
</div>
<section class="carte"><h2>Plan d'actions</h2>${actions ? `<div class="defile"><table class="tableau compact"><thead><tr><th>Id</th><th>Action</th><th>Responsable</th><th>Échéance</th><th>Statut</th><th>Origine</th></tr></thead><tbody>${actions}</tbody></table></div>` : vide('Aucune action.')}</section>
<section class="carte"><h2>Demandes de changement</h2>${changements ? `<div class="defile"><table class="tableau"><thead><tr><th>Id</th><th>Demande</th><th>Demandeur</th><th>Impact</th><th>Décision</th><th>Fonct.</th></tr></thead><tbody>${changements}</tbody></table></div>` : vide('Aucune demande de changement.')}</section>
<section class="carte"><h2>Comptes rendus de réunion</h2>${reunions || vide('Aucun compte rendu (/compte-rendu).')}</section>
<section class="carte"><h2>Parties prenantes</h2>${pp ? `<div class="defile"><table class="tableau compact"><thead><tr><th>Nom / fonction</th><th>Organisme</th><th>Rôle</th><th>Influence</th><th>Attentes</th></tr></thead><tbody>${pp}</tbody></table></div>` : vide('Aucune partie prenante.')}</section>`,
  });
}
function pagesDocuments(p, m) {
  const groupes = {};
  for (const d of p.fichiersMd) {
    const g = d.includes('/') ? d.split('/')[0] : '';
    (groupes[g] ??= []).push(d);
  }
  const titreDoc = (d) => {
    const t = readFileSync(join(p.dir, d), 'utf8');
    return (t.match(/^#\s+(.+)$/m) || [])[1] || d.split('/').pop().replace(/\.md$/, '');
  };
  const index = Object.entries(groupes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([g, ds]) => `<section class="carte"><h2>${esc(TITRES_DOSSIERS[g] || g)}</h2><ul class="docs">${ds.map((d) => `<li><a href="docs/${esc(d.replace(/\.md$/, '.html'))}">${esc(titreDoc(d))}</a> <span class="mute code">${esc(d)}</span></li>`).join('')}</ul></section>`)
    .join('');
  ecrire(`p/${p.code}/livrables.html`, pageLivrables(p, m, index));
  for (const d of p.fichiersMd) {
    const prof = 3 + d.split('/').length - 1;
    const remonter = '../'.repeat(prof - 2);
    const brut = readFileSync(join(p.dir, d), 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    ecrire(`p/${p.code}/docs/${d.replace(/\.md$/, '.html')}`, page({
      titre: `${titreDoc(d)} — ${p.projet.nom}`,
      profondeur: prof,
      fil: [[p.projet.nom || p.code, `${remonter}index.html`], ['Livrables', `${remonter}livrables.html`], [titreDoc(d)]],
      contenu: `<article class="carte prose doc"><p class="mute code">${esc(d)}</p>${md(brut)}</article>`,
    }));
  }
}

// ------------------------------------------------------------ portefeuille
function pagePortefeuille(resumes) {
  const actifs = resumes.filter((r) => !['cloture'].includes(r.p.projet.statut));
  const cartes = resumes
    .map(({ p, m }) => `<a class="carte projet" href="p/${esc(p.code)}/index.html">
  <div class="haut"><h2>${esc(p.projet.nom || p.code)}</h2>${badge(p.projet.statut || 'en_cours')}</div>
  <p class="sous">${esc(p.projet.client || '')} · livraison ${dateFr(p.projet.date_livraison_prevue)}</p>
  <div class="ligne-barre grande"><span>Avancement</span>${barre(m.avancement)}<b>${pct(m.avancement)}</b></div>
  <dl class="chiffres">
    <div><dt>Couverture TDR</dt><dd>${pct(m.couverture)}</dd></div>
    <div><dt>Recette OK</dt><dd>${pct(m.tauxRecette)}</dd></div>
    <div><dt>Livrables</dt><dd>${pct(m.avancementDocuments)}</dd></div>
    <div><dt>Retours ouverts</dt><dd>${m.retoursOuverts.length}</dd></div>
    <div><dt>Actions en retard</dt><dd>${m.actionsEnRetard.length}</dd></div>
    <div><dt>Dernière activité</dt><dd>${ilYa(m.derniereActivite)}</dd></div>
  </dl>
  ${m.prochainJalon ? `<p class="note">Prochain jalon : ${esc(m.prochainJalon.nom)} — ${dateFr(m.prochainJalon.date_prevue)}</p>` : ''}
  ${m.alertes.filter((a) => a.niveau === 'haute').length ? `<p class="alerte-mini">${m.alertes.filter((a) => a.niveau === 'haute').length} alerte(s) importante(s)</p>` : ''}
</a>`)
    .join('');
  const moy = actifs.length ? actifs.reduce((a, r) => a + r.m.avancement, 0) / actifs.length : 0;
  const ouverts = resumes.reduce((a, r) => a + r.m.retoursOuverts.length, 0);
  const alertes = resumes.reduce((a, r) => a + r.m.alertes.filter((x) => x.niveau === 'haute').length, 0);
  ecrire('index.html', page({
    titre: 'Portefeuille',
    contenu: `<section class="titre-projet"><div><h1>Portefeuille de projets</h1><p class="sous">${resumes.length} projet(s) suivi(s)</p></div></section>
<section class="tuiles">
  ${tuile(String(actifs.length), 'Projets actifs')}
  ${tuile(pct(moy), 'Avancement moyen', barre(moy))}
  ${tuile(String(ouverts), 'Retours clients ouverts')}
  ${tuile(String(alertes), 'Alertes importantes', '', alertes ? 'attention' : '')}
</section>
<section class="cartes-projets">${cartes || '<p class="vide">Aucun projet. Créez-en un : <code>npm run nouveau-projet -- mon-projet</code></p>'}</section>`,
  }));
}

// ------------------------------------------------------------ main
rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, 'assets'), { recursive: true });
copyFileSync(join(RACINE, 'dashboard', 'style.css'), join(DIST, 'assets', 'style.css'));

const resumes = [];
for (const code of listerProjets()) {
  const p = chargerProjet(code);
  const m = calculer(p, { maintenant: AUJ });
  const v = verifier(p);
  for (const e of v.erreurs) if (!p.erreurs.includes(e)) m.alertes.push({ niveau: 'moyenne', texte: `Donnée incohérente : ${e}` });
  resumes.push({ p, m });
  ecrire(`p/${code}/index.html`, pageSynthese(p, m));
  ecrire(`p/${code}/fonctionnalites.html`, pageFonctionnalites(p, m));
  ecrire(`p/${code}/tracabilite.html`, pageTracabilite(p, m));
  ecrire(`p/${code}/recette.html`, pageRecette(p, m));
  ecrire(`p/${code}/retours.html`, pageRetours(p, m));
  ecrire(`p/${code}/journal.html`, pageJournal(p, m));
  ecrire(`p/${code}/gestion.html`, pageGestion(p, m));
  pagesDocuments(p, m);
  // Export JSON pour intégrations éventuelles
  ecrire(`p/${code}/etat.json`, JSON.stringify({ code, nom: p.projet.nom, avancement: m.avancement, avancementDocuments: m.avancementDocuments, prochainJalon: m.prochainJalon && { nom: m.prochainJalon.nom, date: m.prochainJalon.date_prevue }, risquesActifs: m.risquesActifs.length, actionsEnRetard: m.actionsEnRetard.length, couverture: m.couverture, tauxRecette: m.tauxRecette, recette: m.recette, retoursOuverts: m.retoursOuverts.length, alertes: m.alertes, genereLe: MAINTENANT.toISOString() }, null, 2));
  console.log(`✓ ${code} — avancement ${pct(m.avancement)}, ${m.alertes.length} alerte(s)`);
}
pagePortefeuille(resumes);
console.log(`Tableau de bord généré dans dist/ (${resumes.length} projet(s)).`);
