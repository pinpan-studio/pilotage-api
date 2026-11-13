import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource, EntityManager } from 'typeorm';
import * as E from '../db/entities';
import { Acteur } from '../common/acteur';
import { conflit } from '../common/erreurs';
import { chargerCatalogue, chargerProjet, lireFrontMatter } from './lecteur-kit';
import { KIT_V1 } from '../db/seed/catalogue';

/** uuid déterministe : réimporter le même journal ne crée pas de doublon. */
export function uuidDeterministe(texte: string) {
  const h = createHash('sha1').update(texte).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const ou = (v: any, d: any = null) => (v === undefined || v === '' ? d : v);
const tab = (v: any) => (Array.isArray(v) ? v : v == null ? [] : [v]);

/** Extrait une section « ## Titre » d'un corps Markdown. */
function section(corps: string, debut: RegExp) {
  const lignes = corps.split('\n');
  const i = lignes.findIndex((l) => debut.test(l));
  if (i < 0) return '';
  const fin = lignes.findIndex((l, k) => k > i && /^## /.test(l));
  return lignes.slice(i + 1, fin < 0 ? undefined : fin).join('\n').trim();
}

@Injectable()
export class ImportKitService {
  constructor(private readonly db: DataSource) {}

  /** Importe un dossier projets/<code> du kit v1. Retourne le projet créé et un bilan. */
  async importerDossier(a: Acteur, dir: string) {
    const catalogue = chargerCatalogue(join(KIT_V1, 'modeles', 'documents', 'catalogue.yaml'));
    const p: any = chargerProjet(dir, catalogue);
    return this.db.transaction((em) => this.ecrire(em, a, p, dir));
  }

  private async ecrire(em: EntityManager, a: Acteur, k: any, dir: string) {
    const org = a.organisation_id;
    const base = { organisation_id: org, cree_par: a.utilisateur_id };
    const code = k.projet.code || k.code;
    if (await em.findOneBy(E.Projet, { organisation_id: org, code })) throw conflit(`le projet « ${code} » existe déjà.`);

    const tdrFichier = join(dir, '00-cadrage', 'tdr.md');
    const projet = await em.save(E.Projet, em.create(E.Projet, {
      ...base, code, nom: k.projet.nom || code, client: k.projet.client || '',
      chef_projet: k.projet.chef_projet ?? null, equipe: tab(k.projet.equipe), description: k.projet.description || '',
      date_debut: ou(k.projet.date_debut), date_livraison_prevue: ou(k.projet.date_livraison_prevue),
      statut: k.projet.statut || 'en_cours', seuil_rappel_doc: Number(k.projet.agent?.seuil_rappel_doc) || 8,
      tdr: existsSync(tdrFichier) ? readFileSync(tdrFichier, 'utf8') : '',
    }));
    const P = { ...base, projet_id: projet.id };

    const depots = new Map<string, string>();
    for (const [ordre, d] of k.depots.entries()) {
      const r = await em.save(E.Depot, em.create(E.Depot, { ...P, nom: d.nom, url: d.url || '', stack: d.stack || '', role: d.role || '', ordre }));
      depots.set(d.nom, r.id);
    }
    const exigences = new Map<string, string>();
    for (const [ordre, x] of k.exigences.entries()) {
      const r = await em.save(E.Exigence, em.create(E.Exigence, { ...P, ref: x.id, titre: x.titre || x.id, section_tdr: x.section_tdr || '', priorite: x.priorite || 'should', description: x.description || '', ordre }));
      exigences.set(x.id, r.id);
    }
    const foncs = new Map<string, string>();
    for (const [ordre, f] of k.fonctionnalites.entries()) {
      const r = await em.save(E.Fonctionnalite, em.create(E.Fonctionnalite, {
        ...P, ref: f.id, titre: f.titre || f.id, jalon: f.jalon || '', poids: Number(f.poids) || 1,
        statut: f.statut || 'a_faire', origine: f.origine || 'TDR', notes: f.notes || '', ordre,
      }));
      foncs.set(f.id, r.id);
      for (const e of tab(f.exigences)) if (exigences.has(e)) await em.insert(E.FonctionnaliteExigence, { fonctionnalite_id: r.id, exigence_id: exigences.get(e)! });
      for (const [nom, statut] of Object.entries(f.depots || {})) {
        if (!depots.has(nom)) depots.set(nom, (await em.save(E.Depot, em.create(E.Depot, { ...P, nom, ordre: depots.size }))).id);
        await em.insert(E.FonctionnaliteDepot, { fonctionnalite_id: r.id, depot_id: depots.get(nom)!, statut: statut as any });
      }
    }
    const tests = new Map<string, string>();
    for (const [ordre, t] of k.tests.entries()) {
      const r = await em.save(E.CasTest, em.create(E.CasTest, {
        ...P, ref: t.id, fonctionnalite_id: foncs.get(t.fonctionnalite) ?? null, titre: t.titre || t.id,
        preconditions: t.preconditions || '', etapes: tab(t.etapes), attendu: t.attendu || '', ordre,
      }));
      tests.set(t.id, r.id);
    }
    for (const c of k.campagnes) {
      const r = await em.save(E.Campagne, em.create(E.Campagne, {
        ...P, ref: c.id, titre: c.titre || '', date: ou(c.date), type: c.type || 'interne',
        environnement: c.environnement || '', testeurs: tab(c.testeurs),
      }));
      for (const x of c.resultats) if (tests.has(x?.test))
        await em.save(E.ResultatTest, em.create(E.ResultatTest, { ...base, campagne_id: r.id, cas_test_id: tests.get(x.test)!, resultat: x.resultat || 'non_teste', commentaire: x.commentaire || '' }));
    }
    for (const rc of k.retours) {
      const r = await em.save(E.RetourClient, em.create(E.RetourClient, {
        ...P, ref: rc.id, date: ou(rc.date), source: rc.source || '', contact_client: rc.contact_client || '',
        saisi_par: rc.saisi_par || '', type: rc.type || 'remarque', priorite: rc.priorite || 'moyenne',
        statut: rc.statut || 'nouveau', date_resolution: ou(rc.date_resolution),
        retour: section(rc.corps, /^## Retour/), analyse: section(rc.corps, /^## Analyse/), action: section(rc.corps, /^## Action/),
        contenu: rc.corps,
      }));
      for (const f of rc.fonctionnalites) if (foncs.has(f)) await em.insert(E.RetourFonctionnalite, { retour_id: r.id, fonctionnalite_id: foncs.get(f)! });
    }

    // Documents (suivi + contenu Markdown importé comme version)
    const types = new Map((await em.findBy(E.TypeDocument, { organisation_id: org })).map((t) => [t.code, t]));
    let versions = 0;
    for (const [ordre, d] of k.suiviDocuments.entries()) {
      const t = types.get(d.code);
      const doc = await em.save(E.Document, em.create(E.Document, {
        ...P, code: d.code, type_document_id: t?.id ?? null,
        titre: t ? null : d.titre, phase: t ? null : d.phase, statut: d.statut, echeance: ou(d.echeance),
        responsable: d.responsable || '', version: d.version ? String(d.version) : '', date_validation: ou(d.date_validation),
        lien_externe: d.lien || '', fichier: d.fichier || '', notes: d.notes || '', ordre,
      }));
      const chemin = d.fichier ? join(dir, d.fichier) : '';
      if (chemin.endsWith('.md') && existsSync(chemin) && statSync(chemin).isFile()) {
        await em.save(E.VersionDocument, em.create(E.VersionDocument, {
          ...base, document_id: doc.id, numero: d.version ? String(d.version) : '0.1',
          contenu: readFileSync(chemin, 'utf8'), resume_modif: 'Import du kit v1', auteur_type: 'humain', auteur_id: a.utilisateur_id,
          figee: ['valide', 'signe'].includes(d.statut),
        }));
        versions++;
      }
    }

    for (const [ordre, j] of k.planning.entries()) {
      const r = await em.save(E.Jalon, em.create(E.Jalon, {
        ...P, ref: j.id || `J${ordre + 1}`, nom: j.nom || '', date_prevue: ou(j.date_prevue), date_reelle: ou(j.date_reelle),
        lot: j.lot || '', facturation: j.facturation || '', ordre,
      }));
      for (const [i, c] of (j.livrables as string[]).entries()) await em.insert(E.JalonDocument, { jalon_id: r.id, code_document: c, ordre: i });
    }
    for (const r of k.risques) await em.save(E.Risque, em.create(E.Risque, {
      ...P, ref: r.id, titre: r.titre || r.id, categorie: r.categorie || '', probabilite: Number(r.probabilite) || 1,
      impact: Number(r.impact) || 1, parade: r.parade || '', responsable: r.responsable || '', date: ou(r.date), statut: r.statut || 'ouvert',
    }));
    for (const x of k.actions) await em.save(E.Action, em.create(E.Action, {
      ...P, ref: x.id, action: x.action || '', responsable: x.responsable || '', echeance: ou(x.echeance), statut: x.statut || 'a_faire',
      origine_type: x.origine ? 'fichier_kit' : '', origine_id: x.origine || '',
    }));
    for (const c of k.changements) {
      const r = await em.save(E.Changement, em.create(E.Changement, {
        ...P, ref: c.id, titre: c.titre || c.id, demandeur: c.demandeur || '', date: ou(c.date), description: c.description || '',
        origine: c.origine || '', impact_delai_jours: Number(c.impact_delai_jours) || 0, impact_cout: String(c.impact_cout ?? ''),
        decision: c.decision || 'en_analyse', date_decision: ou(c.date_decision), avenant: c.avenant || '',
      }));
      for (const f of c.fonctionnalites) if (foncs.has(f)) await em.insert(E.ChangementFonctionnalite, { changement_id: r.id, fonctionnalite_id: foncs.get(f)! });
    }
    for (const pp of k.partiesPrenantes) await em.save(E.PartiePrenante, em.create(E.PartiePrenante, {
      ...P, nom: pp.nom || '', fonction: pp.fonction || '', organisme: pp.organisme || '', role: pp.role || '', influence: pp.influence || '', attentes: pp.attentes || '',
    }));
    for (const r of k.reunions) await em.save(E.Reunion, em.create(E.Reunion, {
      ...P, date: ou(r.date), type: r.type || 'autre', titre: (r.corps.match(/^# (.+)$/m) || [])[1] || '', lieu: r.lieu || '',
      participants: tab(r.participants), redacteur: r.redacteur || '', contenu: r.corps,
    }));
    for (const s of k.sessions) await em.save(E.SessionDev, em.create(E.SessionDev, {
      ...P, depot_id: depots.get(s.depot) ?? null, auteur: s.auteur || '', debut: new Date(`${s.date || '1970-01-01'}T00:00:00Z`),
      fin: new Date(`${s.date || '1970-01-01'}T00:00:00Z`), resume: s.corps, fonctionnalites: s.fonctionnalites,
    }));
    for (const e of k.journal) await em.insert(E.EvenementJournal, {
      ...P, depot_id: depots.get(e.depot) ?? null, auteur: e.auteur || '', session_externe: e.session || '',
      ts: new Date(e.ts), evt: e.evt || 'modification', outil: e.outil || '', fichier: e.fichier || '', commande: e.commande || '',
      hash: e.hash || '', message: e.message || '', fonctionnalites: tab(e.fonctionnalites),
      cle_idempotence: uuidDeterministe(`${code}|${JSON.stringify(e)}`),
    });

    // Documentation technique et ADR
    let docsTech = 0;
    for (const rel of k.fichiersMd as string[]) {
      if (!rel.startsWith('02-technique/')) continue;
      const contenu = readFileSync(join(dir, rel), 'utf8');
      if (rel.startsWith('02-technique/decisions/')) {
        const { meta, corps }: { meta: any; corps: string } = lireFrontMatter(contenu) as any;
        await em.save(E.Adr, em.create(E.Adr, {
          ...P, ref: meta.id || rel.split('/').pop()!.replace(/\.md$/, ''), titre: (corps.match(/^# (?:ADR-\d+\s*—\s*)?(.+)$/m) || [])[1] || '',
          date: meta.date instanceof Date ? meta.date.toISOString().slice(0, 10) : ou(meta.date), statut: meta.statut || 'proposee',
          depots: tab(meta.depots), fonctionnalites: tab(meta.fonctionnalites),
          contexte: section(corps, /^## Contexte/), decision: section(corps, /^## Décision/), consequences: section(corps, /^## Conséquences/),
          alternatives: section(corps, /^## Alternatives/), contenu: corps,
        }));
      } else {
        const chemin = rel.slice('02-technique/'.length);
        const premier = chemin.split('/')[0];
        await em.save(E.DocTechnique, em.create(E.DocTechnique, {
          ...P, depot_id: chemin.includes('/') ? depots.get(premier) ?? null : null, chemin,
          titre: (contenu.match(/^# (.+)$/m) || [])[1] || chemin, contenu,
        }));
        docsTech++;
      }
    }
    // CHANGELOG
    const cl = join(dir, 'CHANGELOG.md');
    let entrees = 0;
    if (existsSync(cl)) {
      const TYPES: Record<string, string> = { ajouté: 'ajoute', modifié: 'modifie', corrigé: 'corrige', retiré: 'retire' };
      let version = 'Non publié', date: string | null = null, type = 'ajoute';
      for (const l of readFileSync(cl, 'utf8').split('\n')) {
        let m;
        if ((m = /^## \[([^\]]+)\](?:\s*—\s*(\d{4}-\d{2}-\d{2}))?/.exec(l))) { version = m[1]; date = m[2] ?? null; }
        else if ((m = /^### (.+)$/.exec(l))) type = TYPES[m[1].trim().toLowerCase()] ?? 'modifie';
        else if ((m = /^- (?:\[(F-\d+)\]\s*)?(.+)$/.exec(l)))
          await em.save(E.ChangelogEntree, em.create(E.ChangelogEntree, { ...P, version, date, type: type as any, texte: m[2], fonctionnalite_id: m[1] ? foncs.get(m[1]) ?? null : null, ordre: entrees++ }));
      }
    }
    return {
      projet: { id: projet.id, code, nom: projet.nom },
      bilan: {
        depots: depots.size, exigences: exigences.size, fonctionnalites: foncs.size, cas_test: tests.size, campagnes: k.campagnes.length,
        retours: k.retours.length, documents: k.suiviDocuments.length, versions_documents: versions, jalons: k.planning.length,
        risques: k.risques.length, actions: k.actions.length, changements: k.changements.length, reunions: k.reunions.length,
        sessions: k.sessions.length, evenements_journal: k.journal.length, docs_techniques: docsTech, entrees_changelog: entrees,
      },
      erreurs_lecture: k.erreurs,
    };
  }
}
