/* eslint-disable */
// PORTAGE À L'IDENTIQUE de la section « lecture » de reference/kit-v1/scripts/lib/pilotage.mjs,
// utilisé uniquement par l'import du kit v1 (POST /import/kit-v1) et par les tests de comparaison.
// @ts-nocheck
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep, basename } from 'node:path';
import YAML from 'yaml';

export function chargerCatalogue(fichier) {
  const c = lireYaml(fichier, { phases: [], documents: [] });
  return { phases: c.phases || [], documents: c.documents || [] };
}

function lireTexte(chemin) {
  return existsSync(chemin) ? readFileSync(chemin, 'utf8') : null;
}

export function lireYaml(chemin, defaut = null, erreurs = []) {
  const t = lireTexte(chemin);
  if (t == null) return defaut;
  try {
    const v = YAML.parse(t);
    return v ?? defaut;
  } catch (e) {
    erreurs.push(`YAML invalide dans ${chemin} : ${e.message.split('\n')[0]}`);
    return defaut;
  }
}

// Sépare l'en-tête YAML (front matter) du corps Markdown.
export function lireFrontMatter(texte) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(texte);
  if (!m) return { meta: {}, corps: texte };
  let meta = {};
  try { meta = YAML.parse(m[1]) || {}; } catch { meta = { __erreur: true }; }
  return { meta, corps: m[2] };
}

function listerFichiers(dossier, filtre = () => true) {
  if (!existsSync(dossier)) return [];
  const res = [];
  for (const nom of readdirSync(dossier)) {
    if (nom.startsWith('.')) continue;
    const c = join(dossier, nom);
    if (statSync(c).isDirectory()) res.push(...listerFichiers(c, filtre));
    else if (filtre(c)) res.push(c);
  }
  return res.sort();
}

const tableau = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const dateStr = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v) : '');


/** Lit un dossier projets/<code> du kit v1. `catalogue` : catalogue des documents (catalogue.yaml). */
export function chargerProjet(dir, catalogue) {
  const code = basename(dir);
  if (!existsSync(dir)) throw new Error(`Projet introuvable : ${code} (${dir})`);
  const erreurs = [];

  const projet = lireYaml(join(dir, 'projet.yaml'), {}, erreurs);
  const depots = tableau(lireYaml(join(dir, 'depots.yaml'), [], erreurs));
  const exigences = tableau(lireYaml(join(dir, '00-cadrage', 'exigences.yaml'), [], erreurs));
  const fonctionnalites = tableau(lireYaml(join(dir, '01-fonctionnalites.yaml'), [], erreurs));
  const tests = tableau(lireYaml(join(dir, '04-recette', 'tests.yaml'), [], erreurs));
  const g = (f) => tableau(lireYaml(join(dir, '07-gestion', f), [], erreurs));
  const planning = g('planning.yaml').map((j) => ({ ...j, date_prevue: dateStr(j.date_prevue), date_reelle: dateStr(j.date_reelle), livrables: tableau(j.livrables) }));
  const risques = g('risques.yaml').map((r) => ({ ...r, date: dateStr(r.date) }));
  const actions = g('actions.yaml').map((a) => ({ ...a, echeance: dateStr(a.echeance) }));
  const changements = g('changements.yaml').map((c) => ({ ...c, date: dateStr(c.date), date_decision: dateStr(c.date_decision), fonctionnalites: tableau(c.fonctionnalites) }));
  const partiesPrenantes = g('parties-prenantes.yaml');
  const reunions = listerFichiers(join(dir, '07-gestion', 'reunions'), (c) => c.endsWith('.md'))
    .map((c) => {
      const { meta, corps } = lireFrontMatter(readFileSync(c, 'utf8'));
      return { ...meta, date: dateStr(meta.date), participants: tableau(meta.participants), corps, __fichier: relative(dir, c).split(sep).join('/') };
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Suivi documentaire : documents.yaml du projet, complété par le catalogue.
  const parCode = Object.fromEntries(catalogue.documents.map((d) => [d.code, d]));
  const docsProjet = existsSync(join(dir, 'documents.yaml')) ? tableau(lireYaml(join(dir, 'documents.yaml'), [], erreurs)) : catalogue.documents.map((d) => ({ code: d.code, statut: 'a_produire', echeance: '', responsable: '', version: '', date_validation: '', notes: '' }));
  const suiviDocuments = docsProjet.filter((d) => d && d.code).map((d) => {
    const ref = parCode[d.code] || {};
    const fichier = d.fichier || ref.emplacement || '';
    const chemin = join(dir, fichier);
    let existe = Boolean(d.lien), nbFichiers = 0; // lien : document hors dépôt (GED, Drive, Figma…)
    if (!existe && fichier && existsSync(chemin)) {
      if (statSync(chemin).isDirectory()) { nbFichiers = listerFichiers(chemin).length; existe = nbFichiers > 0; }
      else existe = true;
    }
    const signes = listerFichiers(join(dir, '08-livrables', 'signes'), (c) => c.split(sep).pop().toUpperCase().startsWith(d.code.toUpperCase()));
    return {
      ...ref, ...d,
      titre: d.titre || ref.titre || d.code,
      phase: d.phase || ref.phase || 'pilotage',
      fichier, existe, nbFichiers,
      scans: signes.map((c) => relative(dir, c).split(sep).join('/')),
      echeance: dateStr(d.echeance), date_validation: dateStr(d.date_validation),
      statut: d.statut || 'a_produire',
      inconnu: !parCode[d.code] && !d.titre,
    };
  });

  const campagnes = listerFichiers(join(dir, '04-recette', 'campagnes'), (c) => /\.ya?ml$/.test(c))
    .map((c) => ({ ...lireYaml(c, {}, erreurs), __fichier: relative(dir, c) }))
    .map((c) => ({ ...c, date: dateStr(c.date), resultats: tableau(c.resultats) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const retours = listerFichiers(join(dir, '05-retours-client'), (c) => c.endsWith('.md') && !/[\\/]_[^\\/]*$/.test(c))
    .map((c) => {
      const { meta, corps } = lireFrontMatter(readFileSync(c, 'utf8'));
      if (meta.__erreur) erreurs.push(`En-tête YAML invalide : ${relative(dir, c)}`);
      return {
        ...meta,
        date: dateStr(meta.date),
        date_resolution: dateStr(meta.date_resolution),
        fonctionnalites: tableau(meta.fonctionnalites),
        corps,
        __fichier: relative(dir, c),
      };
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const journal = [];
  for (const c of listerFichiers(join(dir, '03-journal', 'actions'), (x) => x.endsWith('.jsonl'))) {
    for (const ligne of readFileSync(c, 'utf8').split('\n')) {
      if (!ligne.trim()) continue;
      try { journal.push(JSON.parse(ligne)); } catch { /* ligne corrompue ignorée */ }
    }
  }
  journal.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));

  const sessions = listerFichiers(join(dir, '03-journal', 'sessions'), (c) => c.endsWith('.md'))
    .map((c) => {
      const { meta, corps } = lireFrontMatter(readFileSync(c, 'utf8'));
      return { ...meta, date: dateStr(meta.date), fonctionnalites: tableau(meta.fonctionnalites), corps, __fichier: relative(dir, c) };
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.__fichier.localeCompare(a.__fichier));

  // Tous les documents Markdown (hors retours, sessions et réunions qui ont leur propre vue).
  const fichiersMd = listerFichiers(dir, (c) => c.endsWith('.md'))
    .map((c) => relative(dir, c).split(sep).join('/'))
    .filter((r) => !r.startsWith('05-retours-client/') && !r.startsWith('03-journal/') && !r.startsWith('07-gestion/reunions/'));

  return {
    code,
    dir,
    projet: { ...projet, date_debut: dateStr(projet.date_debut), date_livraison_prevue: dateStr(projet.date_livraison_prevue) },
    depots,
    exigences,
    fonctionnalites,
    tests,
    campagnes,
    retours,
    journal,
    sessions,
    fichiersMd,
    catalogue,
    suiviDocuments,
    planning,
    risques,
    actions,
    changements,
    partiesPrenantes,
    reunions,
    erreurs,
  };
}

