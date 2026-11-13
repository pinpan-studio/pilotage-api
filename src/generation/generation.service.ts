import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import * as E from '../db/entities';
import { Acteur } from '../common/acteur';
import { AccesService } from '../common/acces.service';
import { introuvable, invalide } from '../common/erreurs';
import { LIBELLES } from '../indicateurs/referentiels';
import { EcritureService } from '../ecriture/ecriture.service';
import { CODES_GENERABLES, LectureService } from '../lecture/lecture.service';
import { IndicateursService } from '../indicateurs/indicateurs.service';
import { flowchartArchitecture } from './architecture';

const L = (c: string) => LIBELLES[c] ?? c;
const pct = (x: number | null | undefined) => (x == null ? '—' : `${Math.round(x * 100)} %`);
const dfr = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const cell = (s: unknown) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');
const table = (entetes: string[], lignes: unknown[][]) => lignes.length
  ? [`| ${entetes.join(' | ')} |`, `|${entetes.map(() => '---').join('|')}|`, ...lignes.map((l) => `| ${l.map(cell).join(' | ')} |`)].join('\n')
  : '_Aucun élément._';

type Ctx = { p: E.Projet; a: Acteur; code: string };
type Generateur = { titre: string; fn: (c: Ctx) => Promise<string> };

/**
 * Génère le contenu d'un livrable à partir des informations du projet (cadrage, fonctionnalités, dépôts,
 * décisions, planning, recette, registres). Chaque génération crée une nouvelle version « en cours ».
 */
@Injectable()
export class GenerationService {
  constructor(@InjectDataSource() private readonly db: DataSource, private readonly acces: AccesService, private readonly ecriture: EcritureService,
    private readonly lecture: LectureService, private readonly ind: IndicateursService) {}
  private get em() { return this.db.manager; }
  private liste<T>(entite: new () => T, p: E.Projet, ordre: Record<string, 'ASC' | 'DESC'> = { ref: 'ASC' }) {
    return this.em.find(entite as any, { where: { projet_id: p.id } as any, order: ordre as any }) as Promise<T[]>;
  }
  private entete(p: E.Projet, titre: string) {
    return `# ${titre}\n\n**Projet :** ${p.nom}${p.client ? ` · **Client :** ${p.client}` : ''} · **Généré le** ${dfr(new Date())} à partir des données de Pilotage.\n`;
  }

  readonly generateurs: Record<string, Generateur> = {
    'NOTE-CADRAGE': { titre: 'Note de cadrage', fn: (c) => this.noteCadrage(c) },
    PLANNING: { titre: 'Planning prévisionnel', fn: (c) => this.planning(c) },
    SFD: { titre: 'Spécifications fonctionnelles détaillées', fn: (c) => this.sfd(c) },
    DAT: { titre: "Dossier d'architecture technique", fn: (c) => this.dat(c) },
    'DOC-TECH': { titre: 'Documentation technique', fn: (c) => this.docTech(c) },
    CHANGELOG: { titre: 'Journal des versions', fn: (c) => this.changelog(c) },
    'PLAN-RECETTE': { titre: 'Plan de recette', fn: (c) => this.planRecette(c) },
    'CAHIER-RECETTE': { titre: 'Cahier de recette', fn: (c) => this.cahierRecette(c) },
    'PV-RECETTE': { titre: 'PV de recette', fn: (c) => this.pvRecette(c) },
    'CR-REUNIONS': { titre: 'Comptes rendus de réunion', fn: (c) => this.reunions(c) },
    RAPPORTS: { titre: "Rapport d'avancement", fn: (c) => this.rapport(c) },
    'REG-RISQUES': { titre: 'Registre des risques', fn: (c) => this.risques(c) },
    'REG-ACTIONS': { titre: "Plan d'actions", fn: (c) => this.actions(c) },
    'REG-CHANGEMENTS': { titre: 'Registre des demandes de changement', fn: (c) => this.changements(c) },
    'REG-PARTIES-PRENANTES': { titre: 'Registre des parties prenantes', fn: (c) => this.parties(c) },
    RACI: { titre: 'Organisation du projet', fn: (c) => this.organisation(c) },
    'BORDEREAU-LIVRAISON': { titre: 'Bordereau de livraison', fn: (c) => this.bordereau(c) },
  };
  static readonly CODES_GENERABLES = CODES_GENERABLES;

  /** Aperçu sans enregistrement. */
  async apercu(a: Acteur, code: string, doc: string) {
    const p = await this.acces.projet(a, code);
    const g = this.generateurs[doc];
    if (!g) throw invalide(`le document ${doc} ne se génère pas automatiquement (documents générables : ${GenerationService.CODES_GENERABLES.join(', ')}).`);
    return { code: doc, contenu_md: await g.fn({ p, a, code }) };
  }

  async generer(a: Acteur, code: string, doc: string, opts: { statut?: 'en_cours' | 'en_revue'; session_id?: string } = {}) {
    const { contenu_md } = await this.apercu(a, code, doc);
    const r = await this.ecriture.ecrireDocument(a, code, doc, contenu_md, 'Génération automatique à partir des données du projet', { statut: opts.statut ?? 'en_cours', session_id: opts.session_id });
    return { ...r, contenu_md };
  }

  // ---------------------------------------------------------------- générateurs
  private async noteCadrage({ p }: Ctx) {
    const [ex, jalons, pps, risques, depots] = await Promise.all([this.liste(E.Exigence, p, { ordre: 'ASC' }), this.liste(E.Jalon, p, { ordre: 'ASC' }), this.liste(E.PartiePrenante, p, { nom: 'ASC' }),
      this.liste(E.Risque, p), this.liste(E.Depot, p, { ordre: 'ASC' })]);
    const foncs = await this.em.find(E.Fonctionnalite, { where: { projet_id: p.id }, order: { ordre: 'ASC' } });
    const lots = [...new Set(foncs.map((f) => f.jalon || 'Sans lot'))];
    return [this.entete(p, 'Note de cadrage'),
      '## 1. Contexte et objectifs', p.description || '_À compléter : contexte, enjeux, objectifs mesurables._',
      '## 2. Périmètre', `Le périmètre comprend **${ex.length} exigence(s)** et **${foncs.length} fonctionnalité(s)** réparties en ${lots.length} lot(s) : ${lots.join(', ') || '—'}.`,
      table(['Réf.', 'Exigence', 'Priorité'], ex.map((e) => [e.ref, e.titre, e.priorite.toUpperCase()])),
      '## 3. Calendrier', `Du **${dfr(p.date_debut)}** au **${dfr(p.date_livraison_prevue)}**.`, table(['Jalon', 'Date prévue', 'Lot'], jalons.map((j) => [`${j.ref} ${j.nom}`, dfr(j.date_prevue), j.lot])),
      '## 4. Organisation', table(['Nom', 'Fonction', 'Organisme', 'Rôle'], pps.map((x) => [x.nom, x.fonction, x.organisme, x.role])),
      '## 5. Solution technique', table(['Dépôt', 'Pile', 'Rôle'], depots.map((d) => [d.nom, d.stack, d.role])),
      '## 6. Principaux risques', table(['Réf.', 'Risque', 'Criticité', 'Parade'], risques.filter((r) => r.statut !== 'clos').map((r) => [r.ref, r.titre, r.probabilite * r.impact, r.parade])),
    ].join('\n\n') + '\n';
  }

  private async planning({ p }: Ctx) {
    const jalons = await this.liste(E.Jalon, p, { ordre: 'ASC' });
    const docs = jalons.length ? await this.em.find(E.JalonDocument, { where: { jalon_id: In(jalons.map((j) => j.id)) }, order: { ordre: 'ASC' } }) : [];
    const datees = jalons.filter((j) => j.date_prevue);
    const gantt = datees.length ? ['```mermaid', 'gantt', '  dateFormat YYYY-MM-DD', '  axisFormat %d/%m', `  title ${p.nom.replace(/:/g, ' ')}`, '  section Jalons',
      ...datees.map((j) => `  ${j.nom.replace(/[:#]/g, ' ')} :${j.date_reelle ? 'done' : 'milestone'}, ${j.ref}, ${j.date_prevue}, 1d`), '```'].join('\n') : '';
    return [this.entete(p, 'Planning prévisionnel (jalons)'), `**Début :** ${dfr(p.date_debut)} · **Livraison prévue :** ${dfr(p.date_livraison_prevue)}`, gantt,
      table(['Réf.', 'Jalon', 'Lot', 'Prévu', 'Atteint', 'Facturation', 'Documents attendus'],
        jalons.map((j) => [j.ref, j.nom, j.lot, dfr(j.date_prevue), j.date_reelle ? dfr(j.date_reelle) : '—', j.facturation, docs.filter((d) => d.jalon_id === j.id).map((d) => d.code_document).join(', ')]))].filter(Boolean).join('\n\n') + '\n';
  }

  private async sfd({ p, a, code }: Ctx) {
    const [t, foncs] = await Promise.all([this.lecture.tracabilite(a, code), this.lecture.fonctionnalites(a, code)]);
    const desc = new Map((await this.em.find(E.Fonctionnalite, { where: { projet_id: p.id } })).map((f) => [f.ref, f.description]));
    const lots = [...new Set(foncs.map((f) => f.jalon || 'Sans lot'))];
    const out = [this.entete(p, 'Spécifications fonctionnelles détaillées'), '## 1. Exigences du TDR',
      table(['Réf.', 'Exigence', 'Priorité', 'Couverture'], t.exigences.map((e) => [e.ref, e.titre, e.priorite.toUpperCase(), e.fonctionnalites.map((f) => f.ref).join(', ') || 'non couverte'])), '## 2. Fonctionnalités'];
    for (const lot of lots) {
      out.push(`### ${lot}`);
      for (const f of foncs.filter((x) => (x.jalon || 'Sans lot') === lot)) {
        out.push(`#### ${f.ref} — ${f.titre}`, `*Statut :* ${L(f.statut_effectif)} · *Poids :* ${f.poids}${f.exigences.length ? ` · *Exigences :* ${f.exigences.join(', ')}` : ''}${f.depots.length ? ` · *Dépôts :* ${f.depots.map((d) => d.depot).join(', ')}` : ''}`);
        out.push(desc.get(f.ref)?.trim() || '_Description et critères d’acceptation à compléter._');
      }
    }
    return out.join('\n\n') + '\n';
  }

  private async dat({ p }: Ctx) {
    const [depots, adr, docs] = await Promise.all([this.liste(E.Depot, p, { ordre: 'ASC' }), this.liste(E.Adr, p), this.em.find(E.DocTechnique, { where: { projet_id: p.id }, order: { chemin: 'ASC' } })]);
    const jetons = await this.em.count(E.SessionDev, { where: { projet_id: p.id } });
    const nomD = new Map(depots.map((d) => [d.id, d.nom]));
    return [this.entete(p, "Dossier d'architecture technique"),
      '## 1. Vue d’ensemble', 'Le schéma suivant présente les composants de la solution et leurs échanges (généré à partir des dépôts et de leurs technologies ; à ajuster si besoin).',
      flowchartArchitecture(p.nom, depots, { agentIa: jetons > 0 }),
      '## 2. Composants', table(['Composant', 'Technologies', 'Rôle', 'Dépôt'], depots.map((d) => [d.nom, d.stack, d.role, d.url])),
      '## 3. Décisions d’architecture', adr.length ? adr.map((d) => `### ${d.ref} — ${d.titre} (${L(d.statut)})\n\n**Contexte.** ${d.contexte}\n\n**Décision.** ${d.decision}${d.consequences ? `\n\n**Conséquences.** ${d.consequences}` : ''}${d.alternatives ? `\n\n**Alternatives écartées.** ${d.alternatives}` : ''}`).join('\n\n') : '_Aucune décision enregistrée._',
      '## 4. Documentation technique', table(['Document', 'Dépôt'], docs.map((d) => [d.titre || d.chemin, d.depot_id ? nomD.get(d.depot_id) : '—'])),
      '## 5. Exigences non fonctionnelles', '_Sécurité, disponibilité, performance, sauvegardes : à compléter (voir aussi le document SECURITE)._',
    ].join('\n\n') + '\n';
  }

  private async docTech({ p }: Ctx) {
    const [depots, docs] = await Promise.all([this.liste(E.Depot, p, { ordre: 'ASC' }), this.em.find(E.DocTechnique, { where: { projet_id: p.id }, order: { chemin: 'ASC' } })]);
    const out = [this.entete(p, 'Documentation technique')];
    for (const d of [...depots, { id: null, nom: 'Transverse', stack: '' } as any]) {
      const ds = docs.filter((x) => x.depot_id === d.id); if (!ds.length) continue;
      out.push(`## ${d.nom}${d.stack ? ` — ${d.stack}` : ''}`, ...ds.map((x) => `### ${x.titre || x.chemin}\n\n${x.contenu.replace(/^# .*\n/, '').replace(/^(#{1,4}) /gm, '$1## ')}`));
    }
    if (out.length === 1) out.push('_Aucune documentation technique : l’agent la produit au fil des sessions (ecrire_doc_technique)._');
    return out.join('\n\n') + '\n';
  }

  private async changelog({ p }: Ctx) {
    const [e, foncs] = await Promise.all([this.em.find(E.ChangelogEntree, { where: { projet_id: p.id }, order: { ordre: 'ASC' } }), this.em.find(E.Fonctionnalite, { where: { projet_id: p.id } })]);
    const ref = new Map(foncs.map((f) => [f.id, f.ref]));
    const versions = [...new Set(e.map((x) => x.version))].sort((a, b) => b.localeCompare(a, 'fr', { numeric: true }));
    const T: Record<string, string> = { ajoute: 'Ajouté', modifie: 'Modifié', corrige: 'Corrigé', retire: 'Retiré' };
    return [this.entete(p, 'Journal des versions'), ...versions.map((v) => {
      const lignes = e.filter((x) => x.version === v);
      return `## ${v}\n\n${['ajoute', 'modifie', 'corrige', 'retire'].map((t) => { const l = lignes.filter((x) => x.type === t); return l.length ? `### ${T[t]}\n\n${l.map((x) => `- ${x.texte}${x.fonctionnalite_id ? ` (${ref.get(x.fonctionnalite_id)})` : ''}`).join('\n')}` : ''; }).filter(Boolean).join('\n\n')}`;
    })].join('\n\n') + '\n';
  }

  private async planRecette({ p, a, code }: Ctx) {
    const [t, camps] = await Promise.all([this.lecture.tracabilite(a, code), this.liste(E.Campagne, p, { date: 'ASC' })]);
    const nbTests = t.exigences.flatMap((e) => e.fonctionnalites.flatMap((f) => f.tests)).length + t.hors_tdr.flatMap((f) => f.tests).length;
    return [this.entete(p, 'Plan de recette'), '## 1. Objectifs', 'Vérifier que chaque exigence du TDR est couverte par au moins une fonctionnalité et que chaque fonctionnalité est validée par des cas de test.',
      '## 2. Couverture', `${t.synthese.total} exigence(s) : ${t.synthese.recettees} recettée(s), ${t.synthese.en_recette} en recette, ${t.synthese.ko} avec un test KO, ${t.synthese.sans_test} sans test, ${t.synthese.non_couvertes} non couverte(s). ${nbTests} cas de test au cahier.`,
      '## 3. Organisation', '- **Recette interne** : par l’équipe de réalisation, sur l’environnement de recette.\n- **Recette client** : par les utilisateurs désignés ; résultats saisis dans Pilotage, PV signé.\n- **Critères de passage** : aucun test KO sur une exigence MUST ; réserves listées et datées.',
      '## 4. Campagnes', table(['Campagne', 'Type', 'Date', 'Environnement'], camps.map((c) => [`${c.ref} ${c.titre}`, c.type === 'client' ? 'Client' : 'Interne', dfr(c.date), c.environnement]))].join('\n\n') + '\n';
  }

  private async cahierRecette({ p }: Ctx) {
    const [tests, foncs] = await Promise.all([this.em.find(E.CasTest, { where: { projet_id: p.id }, order: { ordre: 'ASC' } }), this.em.find(E.Fonctionnalite, { where: { projet_id: p.id }, order: { ordre: 'ASC' } })]);
    const out = [this.entete(p, 'Cahier de recette')];
    for (const f of [...foncs, { id: null, ref: '', titre: 'Sans fonctionnalité' } as any]) {
      const ts = tests.filter((x) => x.fonctionnalite_id === f.id); if (!ts.length) continue;
      out.push(`## ${f.ref ? `${f.ref} — ` : ''}${f.titre}`, ...ts.map((x) => `### ${x.ref} — ${x.titre}\n\n${x.preconditions ? `**Préconditions.** ${x.preconditions}\n\n` : ''}**Étapes.**\n\n${x.etapes.map((e, i) => `${i + 1}. ${e}`).join('\n') || '_À compléter._'}\n\n**Résultat attendu.** ${x.attendu || '_À compléter._'}`));
    }
    if (out.length === 1) out.push('_Aucun cas de test._');
    return out.join('\n\n') + '\n';
  }

  private async pvRecette({ p }: Ctx) {
    const camps = await this.liste(E.Campagne, p, { date: 'DESC' });
    const c = camps.find((x) => x.type === 'client') ?? camps[0];
    if (!c) return [this.entete(p, 'Procès-verbal de recette'), '_Aucune campagne de recette enregistrée._'].join('\n\n') + '\n';
    const res = await this.em.find(E.ResultatTest, { where: { campagne_id: c.id } });
    const tests = new Map((await this.em.find(E.CasTest, { where: { projet_id: p.id } })).map((t) => [t.id, t]));
    const n = (r: string) => res.filter((x) => x.resultat === r).length;
    const decision = n('ko') ? 'Recette **refusée** : des cas de test sont KO.' : n('reserve') ? 'Recette **prononcée avec réserves** (liste ci-dessous).' : 'Recette **prononcée sans réserve**.';
    return [this.entete(p, 'Procès-verbal de recette'), `**Campagne :** ${c.ref} — ${c.titre} · **Type :** ${c.type === 'client' ? 'recette client' : 'recette interne'} · **Date :** ${dfr(c.date)} · **Environnement :** ${c.environnement || '—'}${c.testeurs.length ? ` · **Testeurs :** ${c.testeurs.join(', ')}` : ''}`,
      `## Synthèse\n\n${n('ok')} OK · ${n('ko')} KO · ${n('reserve')} réserve(s) · ${n('non_teste')} non testé(s) sur ${res.length} cas.\n\n${decision}`,
      '## Résultats', table(['Cas', 'Titre', 'Résultat', 'Commentaire'], res.map((r) => [tests.get(r.cas_test_id)?.ref, tests.get(r.cas_test_id)?.titre, L(r.resultat), r.commentaire]).sort((x, y) => String(x[0]).localeCompare(String(y[0])))),
      '## Réserves', res.filter((r) => r.resultat !== 'ok').map((r) => `- ${tests.get(r.cas_test_id)?.ref} : ${r.commentaire || L(r.resultat)}`).join('\n') || 'Aucune.',
      '## Signatures', table(['', 'Nom', 'Date', 'Signature'], [['Pour le client', '', '', ''], ['Pour le prestataire', '', '', '']])].join('\n\n') + '\n';
  }

  private async reunions({ p }: Ctx) {
    const r = await this.liste(E.Reunion, p, { date: 'DESC' });
    return [this.entete(p, 'Comptes rendus de réunion'), ...r.map((x) => `## ${dfr(x.date)} — ${x.titre || L(x.type)}\n\n${x.participants.length ? `*Participants :* ${x.participants.join(', ')}\n\n` : ''}${x.contenu.replace(/^(#{1,4}) /gm, '$1## ')}`)].join('\n\n') + '\n';
  }

  private async rapport({ p, a, code }: Ctx) {
    const [m, foncs, risques, actions, jalons] = await Promise.all([this.lecture.indicateurs(a, code), this.lecture.fonctionnalites(a, code), this.liste(E.Risque, p), this.liste(E.Action, p), this.liste(E.Jalon, p, { ordre: 'ASC' })]);
    const prochain = jalons.find((j) => !j.date_reelle && j.date_prevue);
    return [this.entete(p, `Rapport d'avancement du ${dfr(new Date())}`),
      '## Indicateurs', table(['Avancement', 'Couverture TDR', 'Recette OK', 'Livrables', 'Retours ouverts'], [[pct(m.avancement), pct(m.couverture), pct(m.taux_recette), pct(m.avancement_documents), m.retours_ouverts.length]]),
      prochain ? `**Prochain jalon :** ${prochain.ref} ${prochain.nom}, prévu le ${dfr(prochain.date_prevue)}.` : '',
      '## Fonctionnalités en cours', foncs.filter((f) => ['en_cours', 'bloque'].includes(f.statut_effectif)).map((f) => `- ${f.ref} ${f.titre} — ${L(f.statut_effectif)} (${pct(f.avancement)})`).join('\n') || 'Aucune.',
      '## Réalisé', foncs.filter((f) => ['developpe', 'recette', 'valide'].includes(f.statut_effectif)).map((f) => `- ${f.ref} ${f.titre} — ${L(f.statut_effectif)}`).join('\n') || 'Rien pour le moment.',
      '## Risques actifs', table(['Réf.', 'Risque', 'Criticité', 'Parade'], risques.filter((r) => r.statut !== 'clos').sort((x, y) => y.probabilite * y.impact - x.probabilite * x.impact).map((r) => [r.ref, r.titre, r.probabilite * r.impact, r.parade])),
      '## Actions ouvertes', table(['Réf.', 'Action', 'Responsable', 'Échéance'], actions.filter((x) => ['a_faire', 'en_cours'].includes(x.statut)).map((x) => [x.ref, x.action, x.responsable, dfr(x.echeance)])),
    ].filter(Boolean).join('\n\n') + '\n';
  }

  private async risques({ p }: Ctx) {
    const r = await this.liste(E.Risque, p);
    return [this.entete(p, 'Registre des risques'), table(['Réf.', 'Risque', 'Catégorie', 'P', 'I', 'Criticité', 'Parade', 'Responsable', 'Statut'],
      r.map((x) => [x.ref, x.titre, x.categorie, x.probabilite, x.impact, x.probabilite * x.impact, x.parade, x.responsable, L(x.statut)]))].join('\n\n') + '\n';
  }
  private async actions({ p }: Ctx) {
    const r = await this.liste(E.Action, p);
    return [this.entete(p, "Plan d'actions"), table(['Réf.', 'Action', 'Responsable', 'Échéance', 'Statut'], r.map((x) => [x.ref, x.action, x.responsable, dfr(x.echeance), L(x.statut)]))].join('\n\n') + '\n';
  }
  private async changements({ p }: Ctx) {
    const r = await this.liste(E.Changement, p);
    return [this.entete(p, 'Registre des demandes de changement'), table(['Réf.', 'Demande', 'Demandeur', 'Impact délai', 'Impact coût', 'Décision', 'Avenant'],
      r.map((x) => [x.ref, x.titre, x.demandeur, x.impact_delai_jours ? `${x.impact_delai_jours} j` : '', x.impact_cout, `${L(x.decision)}${x.date_decision ? ` (${dfr(x.date_decision)})` : ''}`, x.avenant]))].join('\n\n') + '\n';
  }
  private async parties({ p }: Ctx) {
    const r = await this.liste(E.PartiePrenante, p, { nom: 'ASC' });
    return [this.entete(p, 'Registre des parties prenantes'), table(['Nom', 'Fonction', 'Organisme', 'Rôle', 'Influence', 'Attentes'], r.map((x) => [x.nom, x.fonction, x.organisme, x.role, x.influence, x.attentes]))].join('\n\n') + '\n';
  }
  private async organisation({ p }: Ctx) {
    const [pps, membres] = await Promise.all([this.liste(E.PartiePrenante, p, { nom: 'ASC' }),
      this.em.query(`SELECT u.nom, m.role FROM membre_projet m JOIN utilisateur u ON u.id = m.utilisateur_id WHERE m.projet_id = $1 AND m.supprime_le IS NULL ORDER BY m.role, u.nom`, [p.id])]);
    return [this.entete(p, 'Organisation du projet'), '## Équipe de réalisation', table(['Nom', 'Rôle'], membres.map((m: any) => [m.nom, L(m.role)])),
      '## Parties prenantes', table(['Nom', 'Fonction', 'Organisme', 'Rôle'], pps.map((x) => [x.nom, x.fonction, x.organisme, x.role])),
      '## Matrice RACI', '_R = réalise, A = approuve, C = consulté, I = informé — à compléter._', table(['Activité', 'Chef de projet', 'Développeurs', 'Client'],
        [['Spécifications', 'A', 'R', 'C'], ['Développement', 'A', 'R', 'I'], ['Recette', 'R', 'C', 'A'], ['Mise en production', 'A', 'R', 'I']])].join('\n\n') + '\n';
  }
  private async bordereau({ p, a, code }: Ctx) {
    const docs = (await this.lecture.documents(a, code)).filter((d) => d.livrable && !['a_produire', 'sans_objet'].includes(d.statut));
    const depots = await this.liste(E.Depot, p, { ordre: 'ASC' });
    return [this.entete(p, 'Bordereau de livraison'), `**Date de livraison :** ${dfr(new Date())}`, '## Documents livrés', table(['Code', 'Document', 'Version', 'Statut'], docs.map((d) => [d.code, d.titre, d.version, L(d.statut)])),
      '## Logiciel livré', table(['Composant', 'Technologies', 'Source'], depots.map((d) => [d.nom, d.stack, d.url])),
      '## Réception', table(['', 'Nom', 'Date', 'Signature'], [['Remis par', '', '', ''], ['Reçu par', '', '', '']])].join('\n\n') + '\n';
  }
}
