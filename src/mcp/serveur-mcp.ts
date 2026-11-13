import { GestionService } from '../ecriture/gestion.service';
import { HttpException } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Acteur } from '../common/acteur';
import { LectureService } from '../lecture/lecture.service';
import { EcritureService } from '../ecriture/ecriture.service';
import { IndicateursService } from '../indicateurs/indicateurs.service';
import { AccesService } from '../common/acces.service';
import { LIBELLES } from '../indicateurs/referentiels';
import { rechercher } from './recherche';
import { etatProjet } from './etat';
import { EquipesService } from '../equipes/equipes.service';
import * as E from '../db/entities';

const pct = (x: number | null | undefined) => (x == null ? '—' : `${Math.round(x * 100)} %`);
const L = (c: string) => LIBELLES[c] ?? c;
const PAR_PAGE = 50;

export interface Services { lecture: LectureService; ecriture: EcritureService; ind: IndicateursService; acces: AccesService; equipes: EquipesService; gestion: GestionService }

type Resultat = { content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

/** Réponse lisible par un LLM : Markdown court + données structurées. */
const rep = (texte: string, donnees?: unknown): Resultat => ({
  content: [{ type: 'text', text: texte }],
  ...(donnees !== undefined ? { structuredContent: { donnees: JSON.parse(JSON.stringify(donnees)) } } : {}),
});

/** Les erreurs métier (Refusé, Introuvable, Invalide…) sont renvoyées telles quelles, en français. */
async function sur(fn: () => Promise<Resultat>): Promise<Resultat> {
  try { return await fn(); } catch (e: any) {
    if (!(e instanceof HttpException)) console.error('[mcp]', e?.message);
    const msg = e instanceof HttpException ? (e.getResponse() as any)?.message ?? e.message : 'Erreur interne du serveur Pilotage.';
    return { content: [{ type: 'text', text: Array.isArray(msg) ? msg.join(' ; ') : String(msg) }], isError: true };
  }
}

function paginer<T>(liste: T[], page = 1) {
  const total = liste.length;
  const debut = (Math.max(page, 1) - 1) * PAR_PAGE;
  const elements = liste.slice(debut, debut + PAR_PAGE);
  const suite = debut + PAR_PAGE < total ? `\n\n_${total} éléments ; page ${page}. Demander page ${page + 1} pour la suite._` : '';
  return { elements, total, suite };
}

const projet = z.string().describe('Code du projet (ex. « exemple-declarations »)');
const page = z.number().int().min(1).optional().describe('Page (50 éléments par page)');

export function creerServeurMcp(a: Acteur, s: Services): McpServer {
  const srv = new McpServer(
    { name: 'pilotage', version: '1.0.0' },
    { instructions: "Serveur de pilotage des projets. Appelle `etat_projet` en début de session, `demarrer_session` puis `ajouter_note_session` au fil de l'eau et `cloturer_session` à la fin. Tu ne peux jamais valider ni signer : ces étapes reviennent au chef de projet." },
  );
  const outil = (nom: string, description: string, schema: z.ZodRawShape, fn: (x: any) => Promise<Resultat>, lecture = true) =>
    srv.registerTool(nom, { description, inputSchema: schema, annotations: { readOnlyHint: lecture, destructiveHint: false } }, (x: any) => sur(() => fn(x)));

  // =================================================================== lecture

  outil('lister_projets', 'Projets accessibles avec leur avancement.', {}, async () => {
    const l = await s.lecture.portefeuille(a);
    if (!l.length) return rep('Aucun projet accessible avec ce jeton.', []);
    return rep(['| Projet | Client | Avancement | Recette OK | Retours ouverts | Alertes hautes |', '|---|---|---|---|---|---|',
      ...l.map((p) => `| ${p.code} — ${p.nom} | ${p.client} | ${pct(p.avancement)} | ${pct(p.taux_recette)} | ${p.nb_retours_ouverts} | ${p.nb_alertes.haute} |`)].join('\n'), l);
  });

  outil('etat_projet', "État du projet : indicateurs, fonctionnalités en cours, prochain jalon, documents en cours, actions et retours ouverts, alertes. À appeler en début de session.",
    { projet, depot: z.string().optional().describe('Filtrer les fonctionnalités sur un dépôt') }, async ({ projet: code, depot }) => {
      const { texte, donnees } = await etatProjet(a, s, code, depot);
      return rep(texte, donnees);
    });

  outil('lire_tdr', 'TDR / cahier des charges du projet (Markdown, référence contractuelle).', { projet }, async ({ projet: c }) => {
    const t = (await s.lecture.tdr(a, c)).contenu;
    return rep(t || '_TDR non renseigné._');
  });

  outil('lister_exigences', 'Exigences extraites du TDR.', { projet }, async ({ projet: c }) => {
    const l = await s.lecture.registre(a, c, E.Exigence, { ordre: 'ASC', ref: 'ASC' });
    return rep(l.map((e) => `- ${e.ref} [${e.priorite}] ${e.titre}${e.section_tdr ? ` (${e.section_tdr})` : ''}`).join('\n') || '(aucune)', l.map((e) => ({ ref: e.ref, titre: e.titre, priorite: e.priorite, section_tdr: e.section_tdr })));
  });

  outil('lister_fonctionnalites', 'Fonctionnalités, filtrables par statut, dépôt ou lot.',
    { projet, statut: z.string().optional(), depot: z.string().optional(), lot: z.string().optional(), page }, async ({ projet: c, statut, depot, lot, page: pg }) => {
      const { elements, total, suite } = paginer(await s.lecture.fonctionnalites(a, c, { statut, depot, lot }), pg);
      return rep((elements.map((f) => `- ${f.ref} ${f.titre} [${L(f.statut_effectif)} · ${pct(f.avancement)}] ${f.jalon} · poids ${f.poids}${f.depots.length ? ' — ' + f.depots.map((d) => `${d.depot}: ${L(d.statut)}`).join(', ') : ''}`).join('\n') || '(aucune)') + suite, { total, elements });
    });

  outil('tracabilite', 'Matrice de traçabilité : exigence → fonctionnalités → tests (dernier résultat) → retours ; exigences non couvertes et fonctionnalités hors TDR.', { projet }, async ({ projet: c }) => {
    const t = await s.lecture.tracabilite(a, c);
    const E2: Record<string, string> = { non_couverte: 'NON COUVERTE', sans_test: 'sans test', en_recette: 'en recette', ko: 'KO', recettee: 'recettée' };
    const T = [`# Traçabilité — ${t.synthese.total} exigence(s) : ${t.synthese.recettees} recettée(s), ${t.synthese.en_recette} en recette, ${t.synthese.ko} KO, ${t.synthese.sans_test} sans test, ${t.synthese.non_couvertes} non couverte(s)`,
      ...t.exigences.map((e) => `- ${e.ref} ${e.titre} [${e.priorite}] — ${E2[e.etat]}${e.fonctionnalites.length ? ' : ' + e.fonctionnalites.map((f) => `${f.ref} (${L(f.statut)}; tests ${f.tests.map((x) => `${x.ref}=${x.resultat}`).join(', ') || '—'}${f.retours.length ? '; retours ' + f.retours.map((r) => r.ref).join(', ') : ''})`).join(' · ') : ''}`),
      t.hors_tdr.length ? `## Hors TDR\n${t.hors_tdr.map((f) => `- ${f.ref} ${f.titre} (${L(f.statut)})`).join('\n')}` : ''];
    return rep(T.filter(Boolean).join('\n'), t);
  });

  outil('lire_fonctionnalite', 'Fiche d’une fonctionnalité : exigences, tests, retours, dernière activité, commits.', { projet, ref: z.string() }, async ({ projet: c, ref }) => {
    const f = await s.lecture.fonctionnalite(a, c, ref);
    const T = [`# ${f.ref} — ${f.titre}`, `Statut : ${L(f.statut_effectif)} (global : ${L(f.statut)}) · Avancement ${pct(f.avancement)} · ${f.jalon} · poids ${f.poids} · origine ${f.origine}`,
      `Dépôts : ${f.depots.map((d) => `${d.depot}: ${L(d.statut)}`).join(', ') || '—'}`, `Exigences : ${f.exigences.join(', ') || '—'} · Retours : ${f.retours.join(', ') || '—'}`,
      f.description ? `## Description\n${f.description}` : '', f.notes ? `Notes : ${f.notes}` : '', '## Tests', ...(f.tests.map((t) => `- ${t.ref} ${t.titre} : ${L(t.resultat)}${t.campagne ? ` (${t.campagne})` : ''}`)), f.tests.length ? '' : '- (aucun cas de test)',
      `Dernière activité : ${f.derniere_activite ?? '—'}`, '## Derniers commits', ...f.commits.slice(0, 10).map((e) => `- ${e.ts.slice(0, 10)} ${e.hash} ${e.message}`)];
    return rep(T.filter((x) => x !== '').join('\n'), f);
  });

  outil('lister_documents', 'Suivi documentaire (documents de gestion de projet), filtrable par phase et statut.',
    { projet, phase: z.string().optional(), statut: z.string().optional(), page }, async ({ projet: c, phase, statut, page: pg }) => {
      const { elements, total, suite } = paginer(await s.lecture.documents(a, c, { phase, statut }), pg);
      return rep((elements.map((d) => `- ${d.code} ${d.titre} [${L(d.statut)}]${d.version ? ` v${d.version}` : ''} · ${d.phase} · producteur ${d.producteur}${d.echeance_effective ? ` · échéance ${d.echeance_effective}` : ''}`).join('\n') || '(aucun)') + suite, { total, elements });
    });

  outil('lire_document', 'Contenu Markdown d’un document (dernière version ou version donnée) et son historique.',
    { projet, code: z.string().describe('Code du document (ex. SFD, DAT, PV-RECETTE)'), version: z.string().optional() }, async ({ projet: c, code, version }) => {
      const d = await s.lecture.document(a, c, code, version);
      const tete = `# ${d.code} — ${d.titre}\nStatut : ${L(d.statut)} · version ${d.version || '—'} · producteur ${d.producteur}${d.modele ? ` · modèle ${d.modele}` : ''}\nVersions : ${d.versions.map((v) => `${v.numero}${v.auteur_type === 'agent' ? ' (agent)' : ''}`).join(', ') || 'aucune'}\n\n`;
      return rep(tete + (d.version_courante?.contenu ?? '_Aucun contenu : utiliser lire_modele_document puis ecrire_document._'), { ...d, version_courante: d.version_courante ? { numero: d.version_courante.numero } : null });
    });

  outil('lire_modele_document', 'Modèle Markdown d’un document (ex. sfd, dat, pv-recette, session, retour-client, adr).', { code: z.string() }, async ({ code }) => rep((await s.lecture.modele(a, code)).contenu));

  outil('lister_cas_test', 'Cahier de recette, éventuellement pour une fonctionnalité.', { projet, fonctionnalite: z.string().optional() }, async ({ projet: c, fonctionnalite }) => {
    const p = await s.acces.projet(a, c);
    const { modele, indicateurs: m } = await s.ind.calculer(p);
    const l = modele.tests.filter((t: any) => !fonctionnalite || t.fonctionnalite === fonctionnalite)
      .map((t: any) => ({ ref: t.id, fonctionnalite: t.fonctionnalite, titre: t.titre, etapes: t.etapes, attendu: t.attendu, resultat: m.resultatTest[t.id]?.resultat ?? 'non_teste' }));
    return rep(l.map((t: any) => `- ${t.ref} (${t.fonctionnalite}) ${t.titre} → ${L(t.resultat)}`).join('\n') || '(aucun)', l);
  });

  outil('lire_campagne', 'Résultats d’une campagne de recette.', { projet, ref: z.string() }, async ({ projet: c, ref }) => {
    const x = await s.lecture.campagne(a, c, ref);
    return rep([`# ${x.ref} — ${x.titre}`, `${x.date} · ${x.type} · ${x.environnement} · testeurs : ${x.testeurs.join(', ')}`, ...x.resultats.map((r: any) => `- ${r.test} : ${L(r.resultat)}${r.commentaire ? ` — ${r.commentaire}` : ''}`)].join('\n'), x);
  });

  outil('lister_retours', 'Retours clients, filtrables par statut.', { projet, statut: z.string().optional(), page }, async ({ projet: c, statut, page: pg }) => {
    const l = (await s.lecture.registre(a, c, E.RetourClient, { date: 'DESC', ref: 'ASC' })).filter((r) => !statut || r.statut === statut);
    const { elements, total, suite } = paginer(l, pg);
    return rep((elements.map((r) => `- ${r.ref} ${r.date} [${L(r.type)}, ${L(r.priorite)}, ${L(r.statut)}] ${r.retour.split('\n')[0]}`).join('\n') || '(aucun)') + suite,
      { total, elements: elements.map((r) => ({ ref: r.ref, date: r.date, type: r.type, priorite: r.priorite, statut: r.statut, retour: r.retour, action: r.action })) });
  });

  outil('lister_risques', 'Registre des risques (criticité = probabilité × impact).', { projet }, async ({ projet: c }) => {
    const l = await s.lecture.registre(a, c, E.Risque, { ref: 'ASC' });
    return rep(l.map((r) => `- ${r.ref} [${L(r.statut)}, criticité ${r.probabilite * r.impact}/16] ${r.titre} — parade : ${r.parade || '—'}`).join('\n') || '(aucun)', l);
  });
  outil('lister_actions', 'Plan d’actions.', { projet }, async ({ projet: c }) => {
    const l = await s.lecture.registre(a, c, E.Action, { ref: 'ASC' });
    return rep(l.map((x) => `- ${x.ref} [${L(x.statut)}] ${x.action} — ${x.responsable || '?'}${x.echeance ? `, ${x.echeance}` : ''}`).join('\n') || '(aucune)', l);
  });
  outil('lister_changements', 'Demandes de changement.', { projet }, async ({ projet: c }) => {
    const l = await s.lecture.registre(a, c, E.Changement, { ref: 'ASC' });
    return rep(l.map((x) => `- ${x.ref} [${L(x.decision)}] ${x.titre} (${x.date ?? '?'}, ${x.demandeur})`).join('\n') || '(aucune)', l);
  });
  outil('lister_jalons', 'Planning : jalons et statut.', { projet }, async ({ projet: c }) => {
    const j = (await s.lecture.indicateurs(a, c)).jalons;
    return rep(j.map((x) => `- ${x.ref} ${x.nom} : prévu ${x.date_prevue || '?'} [${L(x.statut)}]${x.ecart ? ` (écart ${x.ecart} j)` : ''}${x.livrables.length ? ` — documents : ${x.livrables.join(', ')}` : ''}`).join('\n') || '(aucun)', j);
  });
  outil('lire_reunion', 'Comptes rendus de réunion : liste, ou contenu d’une réunion par date (AAAA-MM-JJ).', { projet, date: z.string().optional() }, async ({ projet: c, date }) => {
    const l = await s.lecture.registre(a, c, E.Reunion, { date: 'DESC' });
    if (!date) return rep(l.map((r) => `- ${r.date} [${r.type}] ${r.titre}`).join('\n') || '(aucune)', l.map((r) => ({ date: r.date, type: r.type, titre: r.titre })));
    const r = l.filter((x) => x.date === date);
    return rep(r.map((x) => x.contenu).join('\n\n---\n\n') || `Aucune réunion le ${date}.`);
  });

  outil('lire_doc_technique', 'Documentation technique : liste des pages, ou contenu d’une page (dépôt + chemin).',
    { projet, depot: z.string().optional(), chemin: z.string().optional() }, async ({ projet: c, depot, chemin }) => {
      const l = await s.lecture.docTechnique(a, c, { depot, chemin });
      if (chemin && l.length) return rep(l[0].contenu);
      return rep(l.map((d) => `- ${d.chemin} — ${d.titre}`).join('\n') || '(aucune page)', l.map((d) => ({ chemin: d.chemin, depot: d.depot, titre: d.titre })));
    });

  outil('rechercher', 'Recherche plein texte (français) dans fonctionnalités, exigences, documents, retours, doc technique, ADR, réunions et sessions.',
    { projet, texte: z.string().min(2) }, async ({ projet: c, texte }) => {
      const p = await s.acces.projet(a, c);
      const r = await rechercher(s.lecture, p, texte);
      return rep(r.map((x) => `- [${x.type}] ${x.ref} — ${x.titre} : …${x.extrait}…`).join('\n') || 'Aucun résultat.', r);
    });

  // =================================================================== écriture

  outil('demarrer_session', 'Démarre une session de développement (appelé par le hook de début de session). Retourne session_id.',
    { projet, depot: z.string().optional(), session_externe: z.string().optional().describe("Identifiant de session de l'assistant (Claude Code, Cursor, Codex…)") }, async ({ projet: c, depot, session_externe }) => {
      const { session } = await s.ecriture.demarrerSession(a, c, depot, session_externe);
      return rep(`Session démarrée : ${session.id}`, { session_id: session.id });
    }, false);

  outil('ajouter_note_session', 'Ajoute une note au fil de l’eau à la session en cours.',
    { session_id: z.string().uuid(), texte: z.string().min(1), fonctionnalites: z.array(z.string()).optional() }, async ({ session_id, texte, fonctionnalites }) => {
      const n = await s.ecriture.ajouterNoteSession(a, session_id, texte, fonctionnalites);
      return rep(`Note ajoutée (${n.nb_notes} note(s) dans la session).`, n);
    }, false);

  outil('cloturer_session', 'Clôture la session avec un résumé Markdown (modèle « session.md »).',
    { session_id: z.string().uuid(), resume_md: z.string().min(1) }, async ({ session_id, resume_md }) => {
      const x = await s.ecriture.cloturerSession(a, session_id, resume_md);
      return rep(`Session clôturée le ${x.fin?.toISOString()}.`, { session_id: x.id });
    }, false);

  outil('maj_statut_fonctionnalite', "Met à jour le statut d'une fonctionnalité (global, ou d'un dépôt si `depot`). Interdit : « valide ». « recette » seulement si tous ses tests sont OK.",
    { projet, ref: z.string(), statut: z.string().describe('a_faire | en_cours | bloque | developpe | recette (dépôt : a_faire | en_cours | bloque | developpe)'), depot: z.string().optional(), notes: z.string().optional(), session_id: z.string().uuid().optional() },
    async ({ projet: c, ref, statut, depot, notes, session_id }) => {
      const r = await s.ecriture.majStatutFonctionnalite(a, c, ref, statut, { depot, notes, session_id });
      return rep(`${ref}${depot ? ` (dépôt ${depot})` : ''} → ${L(statut)}.`, r);
    }, false);

  outil('ecrire_document', "Écrit une NOUVELLE VERSION d'un document de gestion de projet. Statut résultant : en_cours (défaut) ou en_revue, jamais au-delà. Refusé si le document est produit par un humain.",
    { projet, code: z.string(), contenu_md: z.string().min(1), resume_modif: z.string().min(1), statut: z.enum(['en_cours', 'en_revue']).optional(), session_id: z.string().uuid().optional() },
    async ({ projet: c, code, contenu_md, resume_modif, statut, session_id }) => {
      const r = await s.ecriture.ecrireDocument(a, c, code, contenu_md, resume_modif, { statut, session_id });
      return rep(`${code} : version ${r.version} enregistrée, statut « ${L(r.statut)} »${r.repasse_en_revue ? ' (la version validée reste figée ; la nouvelle repasse en revue)' : ''}.`, r);
    }, false);

  outil('maj_statut_document', "Change le statut d'un document. L'agent ne peut aller que jusqu'à « en_revue » : valider et signer sont réservés au chef de projet.",
    { projet, code: z.string(), statut: z.string(), session_id: z.string().uuid().optional() }, async ({ projet: c, code, statut, session_id }) => {
      const r = await s.ecriture.majStatutDocument(a, c, code, statut, session_id);
      return rep(`${code} → ${L(r.statut)}.`, r);
    }, false);

  outil('ecrire_doc_technique', 'Crée ou met à jour une page de documentation technique (historisée).',
    { projet, depot: z.string().optional(), chemin: z.string().describe('ex. api.md, installation.md'), contenu_md: z.string().min(1), session_id: z.string().uuid().optional() },
    async ({ projet: c, depot, chemin, contenu_md, session_id }) => {
      const r = await s.ecriture.ecrireDocTechnique(a, c, depot, chemin, contenu_md, session_id);
      return rep(`Doc technique ${r.chemin} ${r.cree ? 'créée' : 'mise à jour'}.`, r);
    }, false);

  outil('creer_retour', 'Enregistre un retour client (référence RC-xxx attribuée par le serveur).',
    { projet, retour_md: z.string().min(1), type: z.enum(['bug', 'evolution', 'question', 'remarque']).optional(), priorite: z.enum(['haute', 'moyenne', 'basse']).optional(),
      source: z.string().optional(), contact_client: z.string().optional(), date: z.string().optional(), fonctionnalites: z.array(z.string()).optional(), session_id: z.string().uuid().optional() },
    async ({ projet: c, session_id, ...x }) => {
      const r = await s.ecriture.creerRetour(a, c, x, session_id);
      return rep(`Retour ${r.ref} créé.`, { ref: r.ref });
    }, false);

  outil('ajouter_risque', 'Ajoute un risque (référence R-xxx).',
    { projet, titre: z.string().min(1), probabilite: z.number().int().min(1).max(4), impact: z.number().int().min(1).max(4), categorie: z.string().optional(), parade: z.string().optional(), responsable: z.string().optional(), session_id: z.string().uuid().optional() },
    async ({ projet: c, session_id, ...x }) => {
      const r = await s.ecriture.ajouterRisque(a, c, x, session_id);
      return rep(`Risque ${r.ref} ajouté (criticité ${r.probabilite * r.impact}/16).`, { ref: r.ref });
    }, false);

  outil('ajouter_action', 'Ajoute une action au plan d’actions (référence A-xxx).',
    { projet, action: z.string().min(1), responsable: z.string().optional(), echeance: z.string().optional().describe('AAAA-MM-JJ'), session_id: z.string().uuid().optional() },
    async ({ projet: c, session_id, ...x }) => {
      const r = await s.ecriture.ajouterAction(a, c, x, session_id);
      return rep(`Action ${r.ref} ajoutée.`, { ref: r.ref });
    }, false);

  outil('creer_fonctionnalite', "Crée une fonctionnalité (référence F-xxx attribuée par le serveur). Origine « interne » ou « DC-xxx » (demande de changement acceptée).",
    { projet, titre: z.string().min(1), exigences: z.array(z.string()).optional(), lot: z.string().optional(), poids: z.number().int().optional().describe('1, 2, 3, 5 ou 8'),
      origine: z.string().optional(), depots: z.array(z.string()).optional(), description: z.string().optional().describe('Description et critères d’acceptation (Markdown)'), session_id: z.string().uuid().optional() },
    async ({ projet: c, session_id, ...x }) => {
      const f = await s.ecriture.creerFonctionnalite(a, c, x, session_id);
      return rep(`Fonctionnalité ${f.ref} créée (${f.origine}, poids ${f.poids}).`, { ref: f.ref });
    }, false);

  outil('ajouter_adr', 'Enregistre une décision d’architecture (référence ADR-xxx, statut « proposee »).',
    { projet, titre: z.string().min(1), contexte: z.string().min(1), decision: z.string().min(1), consequences: z.string().optional(), alternatives: z.string().optional(),
      depots: z.array(z.string()).optional(), fonctionnalites: z.array(z.string()).optional(), session_id: z.string().uuid().optional() },
    async ({ projet: c, session_id, ...x }) => {
      const r = await s.ecriture.ajouterAdr(a, c, x, session_id);
      return rep(`${r.ref} enregistrée.`, { ref: r.ref });
    }, false);

  outil('ajouter_entree_changelog', 'Ajoute une entrée au changelog (section « Non publié » par défaut).',
    { projet, type: z.enum(['ajoute', 'modifie', 'corrige', 'retire']), texte: z.string().min(1), fonctionnalite: z.string().optional(), version: z.string().optional(), session_id: z.string().uuid().optional() },
    async ({ projet: c, session_id, ...x }) => {
      await s.ecriture.ajouterEntreeChangelog(a, c, x, session_id);
      return rep(`Changelog : ${x.fonctionnalite ? `[${x.fonctionnalite}] ` : ''}${x.texte}`);
    }, false);

  outil('maj_retour', 'Met à jour le statut d’un retour client et l’action / réponse apportée.',
    { projet, ref: z.string(), statut: z.enum(['nouveau', 'en_cours', 'resolu', 'rejete']), action_md: z.string().optional(), session_id: z.string().uuid().optional() },
    async ({ projet: c, ref, statut, action_md, session_id }) => {
      const r = await s.ecriture.majRetour(a, c, ref, statut, action_md, session_id);
      return rep(`${r.ref} → ${L(r.statut)}.`, { ref: r.ref, statut: r.statut });
    }, false);

  outil('maj_action', 'Met à jour le statut d’une action.', { projet, ref: z.string(), statut: z.enum(['a_faire', 'en_cours', 'fait', 'annule']), session_id: z.string().uuid().optional() },
    async ({ projet: c, ref, statut, session_id }) => {
      const r = await s.ecriture.majAction(a, c, ref, statut, session_id);
      return rep(`${r.ref} → ${L(r.statut)}.`, { ref: r.ref, statut: r.statut });
    }, false);

  // =================================================================== équipe et projets

  outil('lister_membres', "Membres d'un projet et leur rôle (chef de projet, développeur, lecteur).", { projet }, async ({ projet: c }) => {
    const l: any[] = await s.equipes.membresProjet(a, c);
    return rep(l.map((m) => `- ${m.nom} <${m.email}> — ${L(m.role)}${m.actif ? '' : ' (désactivé)'}`).join('\n') || '(aucun membre)', l.map((m) => ({ nom: m.nom, email: m.email, role: m.role })));
  });

  outil('maj_fonctionnalite', 'Modifie une fonctionnalité : titre, lot, poids, description / critères d’acceptation, dépôts concernés (pas le statut : voir maj_statut_fonctionnalite).',
    { projet, ref: z.string(), titre: z.string().optional(), lot: z.string().optional(), poids: z.number().int().optional().describe('1, 2, 3, 5 ou 8'),
      description: z.string().optional(), depots: z.array(z.string()).optional(), session_id: z.string().uuid().optional() },
    async ({ projet: c, ref, session_id, ...x }) => {
      const f = await s.gestion.majFonctionnalite(a, c, ref, x, session_id);
      return rep(`Fonctionnalité ${f.ref} mise à jour.`, { ref: f.ref });
    }, false);

  outil('creer_jalon', 'Ajoute un jalon au planning (référence J1, J2…), avec les documents attendus à cette échéance.',
    { projet, nom: z.string().min(2), date_prevue: z.string().optional().describe('AAAA-MM-JJ'), lot: z.string().optional(), facturation: z.string().optional().describe('ex. « 30 % »'),
      documents: z.array(z.string()).optional().describe('Codes des documents attendus (ex. PV-RECETTE)'), session_id: z.string().uuid().optional() },
    async ({ projet: c, session_id, ...x }) => {
      const j = await s.gestion.creerJalon(a, c, x, session_id);
      return rep(`Jalon ${j.ref} « ${j.nom} » ajouté${j.date_prevue ? ` (prévu le ${j.date_prevue})` : ''}.`, { ref: j.ref });
    }, false);

  outil('maj_jalon', 'Met à jour un jalon : date prévue, date réelle (jalon atteint), nom, lot.',
    { projet, ref: z.string(), nom: z.string().optional(), date_prevue: z.string().optional(), date_reelle: z.string().optional().describe('AAAA-MM-JJ : jalon atteint'), lot: z.string().optional(), session_id: z.string().uuid().optional() },
    async ({ projet: c, ref, session_id, ...x }) => {
      const j = await s.gestion.majJalon(a, c, ref, x, session_id);
      return rep(`Jalon ${j.ref} mis à jour.`, { ref: j.ref });
    }, false);

  outil('maj_risque', 'Met à jour un risque : statut (ouvert, surveille, survenu, clos), probabilité, impact, parade, responsable.',
    { projet, ref: z.string(), statut: z.enum(['ouvert', 'surveille', 'survenu', 'clos']).optional(), probabilite: z.number().int().min(1).max(4).optional(), impact: z.number().int().min(1).max(4).optional(),
      parade: z.string().optional(), responsable: z.string().optional(), session_id: z.string().uuid().optional() },
    async ({ projet: c, ref, session_id, ...x }) => {
      const r = await s.gestion.majRisque(a, c, ref, x, session_id);
      return rep(`Risque ${r.ref} mis à jour (criticité ${r.probabilite * r.impact}/16, ${r.statut}).`, { ref: r.ref });
    }, false);

  outil('ecrire_tdr', "Remplace le texte du TDR (Markdown). Réservé au chef de projet ; l'agent seulement pendant une révision de périmètre ouverte par un humain.",
    { projet, contenu_md: z.string().min(1), session_id: z.string().uuid().optional() },
    async ({ projet: c, contenu_md, session_id }) => { await s.gestion.ecrireTdr(a, c, contenu_md, session_id); return rep('TDR mis à jour.'); }, false);

  outil('creer_exigence', "Ajoute une exigence au cadrage (référence EX-xx). Mêmes droits que ecrire_tdr.",
    { projet, titre: z.string().min(2), priorite: z.enum(['must', 'should', 'could']).optional(), section_tdr: z.string().optional(), description: z.string().optional() },
    async ({ projet: c, ...x }) => { const e = await s.gestion.creerExigence(a, c, x); return rep(`Exigence ${e.ref} ajoutée.`, { ref: e.ref }); }, false);

  outil('ajouter_partie_prenante', 'Ajoute une partie prenante au registre (nom, fonction, organisme, rôle, influence, attentes).',
    { projet, nom: z.string().min(2), fonction: z.string().optional(), organisme: z.string().optional(), role: z.string().optional(), influence: z.string().optional().describe('forte, moyenne, faible'), attentes: z.string().optional() },
    async ({ projet: c, ...x }) => { const pp = await s.gestion.creerPartiePrenante(a, c, x); return rep(`Partie prenante « ${pp.nom} » ajoutée.`, { id: pp.id }); }, false);

  outil('creer_cas_test', 'Crée un cas de test de recette (référence RT-xxx), rattaché à une fonctionnalité.',
    { projet, titre: z.string().min(1), fonctionnalite: z.string().optional().describe('F-xxx'), preconditions: z.string().optional(), etapes: z.array(z.string()).optional(), attendu: z.string().optional(), session_id: z.string().uuid().optional() },
    async ({ projet: c, session_id, ...x }) => {
      const r = await s.ecriture.creerCasTest(a, c, x, session_id);
      return rep(`Cas de test ${r.ref} créé${x.fonctionnalite ? ` pour ${x.fonctionnalite}` : ''}.`, { ref: r.ref });
    }, false);

  outil('enregistrer_resultats', "Enregistre les résultats d'une campagne de recette interne (créée si la référence est nouvelle, ex. « R2 »). Les campagnes client sont réservées aux humains.",
    { projet, campagne: z.string().min(1), titre: z.string().optional(), date: z.string().optional().describe('AAAA-MM-JJ'), environnement: z.string().optional(),
      resultats: z.array(z.object({ cas_test: z.string().describe('RT-xxx'), resultat: z.enum(['ok', 'ko', 'reserve', 'non_teste']), commentaire: z.string().optional() })).min(1), session_id: z.string().uuid().optional() },
    async ({ projet: c, session_id, ...x }) => {
      const r = await s.ecriture.enregistrerResultats(a, c, { ...x, type: 'interne' }, session_id);
      return rep(`Campagne ${r.campagne} : ${r.bilan.ok} OK, ${r.bilan.ko} KO, ${r.bilan.reserve} réserve(s), ${r.bilan.non_teste} non testé(s).`, r);
    }, false);

  outil('proposer_changement', 'Propose une demande de changement (référence DC-xxx). La décision reste « en analyse » : seul un humain décide.',
    { projet, titre: z.string().min(1), description: z.string().optional(), demandeur: z.string().optional(), impact_delai_jours: z.number().int().optional(), impact_cout: z.string().optional(),
      fonctionnalites: z.array(z.string()).optional(), session_id: z.string().uuid().optional() },
    async ({ projet: c, session_id, ...x }) => {
      const r = await s.ecriture.proposerChangement(a, c, x, session_id);
      return rep(`Demande de changement ${r.ref} enregistrée (en analyse).`, { ref: r.ref });
    }, false);

  outil('creer_compte_rendu', 'Crée le compte rendu d’une réunion et alimente, dans la même transaction, les actions, risques et demandes de changement qui en découlent.',
    { projet, date: z.string().describe('AAAA-MM-JJ'), type: z.string().optional().describe('comite | atelier | point | recette | autre'), titre: z.string().optional(), lieu: z.string().optional(),
      participants: z.array(z.string()).optional(), contenu_md: z.string().min(1), decisions: z.array(z.string()).optional(),
      actions: z.array(z.object({ action: z.string().min(1), responsable: z.string().optional(), echeance: z.string().optional() })).optional(),
      risques: z.array(z.object({ titre: z.string().min(1), probabilite: z.number().int().min(1).max(4), impact: z.number().int().min(1).max(4), categorie: z.string().optional(), parade: z.string().optional(), responsable: z.string().optional() })).optional(),
      changements: z.array(z.object({ titre: z.string().min(1), description: z.string().optional(), demandeur: z.string().optional(), fonctionnalites: z.array(z.string()).optional() })).optional(),
      session_id: z.string().uuid().optional() },
    async ({ projet: c, session_id, ...x }) => {
      const r = await s.ecriture.creerCompteRendu(a, c, x, session_id);
      return rep(`Compte rendu du ${r.date} créé. Actions : ${r.actions.join(', ') || '—'} · Risques : ${r.risques.join(', ') || '—'} · Changements : ${r.changements.join(', ') || '—'}.`, r);
    }, false);

  outil('creer_projet', "Crée un projet dans l'équipe (documents du catalogue instanciés « à produire », vous devenez chef de projet). Réservé si le développeur lié au jeton est administrateur ou chef de projet.",
    { code: z.string().regex(/^[a-z0-9][a-z0-9-]{1,60}$/).describe('Identifiant court : minuscules, chiffres, tirets'), nom: z.string().min(2), client: z.string().optional(), description: z.string().optional(),
      date_debut: z.string().optional().describe('AAAA-MM-JJ'), date_livraison_prevue: z.string().optional().describe('AAAA-MM-JJ'),
      depots: z.array(z.object({ nom: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/), url: z.string().optional(), stack: z.string().optional() })).optional(),
      visibilite: z.enum(['equipe', 'equipe_lecture', 'membres']).optional().describe('equipe (défaut) : toute l’équipe voit et contribue ; equipe_lecture : toute l’équipe voit ; membres : privé') },
    async (x) => {
      const r = await s.equipes.creerProjet(a, x);
      const limite = a.projets_jeton?.length ? " Ce jeton est limité à certains projets : demandez à l'administrateur de l'autoriser sur celui-ci pour y écrire." : '';
      return rep(`Projet ${r.code} créé (${r.nb_documents} documents à produire).${limite}`, r);
    }, false);

  // =================================================================== prompts (commandes du kit)
  const PROMPTS: Record<string, [string, string]> = {
    'init-projet': ['Prend connaissance d’un projet avant de coder', "Projet « {projet} ». Appelle etat_projet, lire_tdr, lister_exigences et lister_fonctionnalites. Résume le périmètre, les lots, l'avancement et les points d'attention, puis propose les prochaines fonctionnalités à traiter. {demande}"],
    document: ['Rédige ou met à jour un livrable documentaire', "Projet « {projet} ». Livrable demandé : {demande}. Appelle lister_documents pour trouver le code, lire_modele_document pour le modèle, lire_document pour la version courante, rassemble les informations (lire_tdr, lister_fonctionnalites, registres), puis ecrire_document avec un resume_modif précis. Ne dépasse jamais le statut « en_revue »."],
    'compte-rendu': ['Saisit le compte rendu d’une réunion', "Projet « {projet} ». Notes de réunion : {demande}. Structure-les (participants, points abordés, décisions) et appelle creer_compte_rendu en une fois avec les actions (responsable, échéance AAAA-MM-JJ), les risques (probabilité et impact de 1 à 4) et les demandes de changement qui en découlent."],
    recette: ['Prépare les cas de test ou enregistre une campagne', "Projet « {projet} ». Demande : {demande}. Mode cas : lister_fonctionnalites (statut developpe) et lister_cas_test, puis creer_cas_test pour chaque fonctionnalité insuffisamment couverte (nominal, erreurs, droits, cas limites). Mode campagne : enregistrer_resultats, puis maj_statut_fonctionnalite à « recette » uniquement pour les fonctionnalités dont tous les tests sont OK."],
    'retour-client': ['Enregistre un retour client', "Projet « {projet} ». Retour : {demande}. Qualifie-le (bug, évolution, question, remarque ; priorité), rattache-le aux fonctionnalités concernées (rechercher, lister_fonctionnalites) et appelle creer_retour. Si c'est une évolution hors périmètre, propose aussi proposer_changement."],
    avancement: ['Fait le point d’avancement', "Projet « {projet} ». Appelle etat_projet, lister_fonctionnalites, lister_actions, lister_risques et lister_jalons. Rédige un point d'avancement court : réalisé, en cours, bloquants, risques, prochaines échéances. {demande}"],
    'fin-session': ['Clôture la session de développement', "Projet « {projet} ». Mets à jour les statuts des fonctionnalités touchées (maj_statut_fonctionnalite par dépôt), ajoute les entrées de changelog, puis cloturer_session avec un résumé : fait, décisions, points ouverts, prochaine étape. {demande}"],
  };
  for (const [nom, [description, gabarit]] of Object.entries(PROMPTS))
    srv.registerPrompt(nom, { description, argsSchema: { projet: z.string().describe('Code du projet'), demande: z.string().optional() } },
      ({ projet: pj, demande }: any) => ({ messages: [{ role: 'user', content: { type: 'text', text: gabarit.replace('{projet}', pj).replace('{demande}', demande ?? '') } }] }));

  return srv;
}
