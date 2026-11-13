// Formes des réponses de l'API (documentées automatiquement dans openapi.json par le plugin Swagger).

export class AlerteDto {
  /** haute | moyenne | basse */
  niveau: 'haute' | 'moyenne' | 'basse';
  texte: string;
}

export class AvancementNommeDto {
  nom: string;
  nb: number;
  avancement: number;
}

export class PhaseAvancementDto {
  code: string;
  titre: string;
  nb: number;
  finalises: number;
  avancement: number | null;
}

export class RecetteDto {
  ok: number;
  ko: number;
  reserve: number;
  non_teste: number;
}

export class ResultatTestDto {
  resultat: 'ok' | 'ko' | 'reserve' | 'non_teste';
  campagne: string;
  commentaire: string;
}

export class JalonStatutDto {
  ref: string;
  nom: string;
  date_prevue: string;
  date_reelle: string;
  lot: string;
  facturation: string;
  livrables: string[];
  /** atteint | en_retard | a_venir */
  statut: 'atteint' | 'en_retard' | 'a_venir';
  /** Écart en jours (retard positif). */
  ecart: number | null;
}

export class RisqueCritiqueDto {
  ref: string;
  titre: string;
  statut: string;
  criticite: number;
}

export class ActiviteJourDto {
  jour: string;
  nb: number;
}

export class SynchroDepotDto {
  depot: string;
  /** Horodatage du dernier événement de journal reçu pour ce dépôt. */
  derniere_synchro: string | null;
}

/** Indicateurs d'un projet, calculés par l'API (le frontend ne recalcule rien). */
export class IndicateursDto {
  date_calcul: string;
  avancement: number;
  nb_fonctionnalites: number;
  par_statut: Record<string, number>;
  par_lot: AvancementNommeDto[];
  par_depot: AvancementNommeDto[];
  couverture: number | null;
  exigences_non_couvertes: string[];
  recette: RecetteDto;
  taux_recette: number | null;
  resultats_tests: Record<string, ResultatTestDto>;
  retours_ouverts: string[];
  delai_moyen_resolution: number | null;
  activite_par_jour: ActiviteJourDto[];
  derniere_activite: string | null;
  derniere_activite_fonctionnalite: Record<string, string>;
  nb_commits: number;
  avancement_documents: number | null;
  documents_par_phase: PhaseAvancementDto[];
  jalons: JalonStatutDto[];
  prochain_jalon: JalonStatutDto | null;
  risques: RisqueCritiqueDto[];
  nb_risques_actifs: number;
  actions_ouvertes: string[];
  actions_en_retard: string[];
  changements_en_analyse: string[];
  synchronisation: SynchroDepotDto[];
  alertes: AlerteDto[];
}

/** Carte du portefeuille. */
export class ProjetResumeDto {
  id: string;
  code: string;
  nom: string;
  client: string;
  statut: string;
  date_livraison_prevue: string | null;
  avancement: number;
  couverture: number | null;
  taux_recette: number | null;
  avancement_documents: number | null;
  nb_retours_ouverts: number;
  nb_actions_en_retard: number;
  prochain_jalon: JalonStatutDto | null;
  nb_alertes: RecetteNiveauxDto;
  derniere_activite: string | null;
}

export class RecetteNiveauxDto {
  haute: number;
  moyenne: number;
  basse: number;
}

export class ProjetDetailDto {
  id: string;
  code: string;
  nom: string;
  client: string;
  chef_projet: string | null;
  equipe: string[];
  description: string;
  date_debut: string | null;
  date_livraison_prevue: string | null;
  statut: string;
  seuil_rappel_doc: number;
  revision_perimetre: boolean;
  depots: DepotDto[];
}

export class DepotDto {
  id: string;
  nom: string;
  url: string;
  stack: string;
  role: string;
}

export class StatutDepotDto {
  depot: string;
  statut: string;
}

export class FonctionnaliteDto {
  id: string;
  ref: string;
  titre: string;
  jalon: string;
  poids: number;
  statut: string;
  statut_effectif: string;
  avancement: number;
  origine: string;
  notes: string;
  exigences: string[];
  depots: StatutDepotDto[];
  cas_test: string[];
  retours: string[];
  derniere_activite: string | null;
}

export class CasTestResultatDto {
  ref: string;
  titre: string;
  resultat: string;
  campagne: string | null;
}

export class EvenementDto {
  id: string;
  ts: string;
  evt: string;
  depot: string | null;
  auteur: string;
  outil: string;
  fichier: string;
  commande: string;
  hash: string;
  message: string;
  fonctionnalites: string[];
}

export class FonctionnaliteDetailDto extends FonctionnaliteDto {
  /** Description et critères d'acceptation (Markdown). */
  description: string;
  tests: CasTestResultatDto[];
  journal: EvenementDto[];
  commits: EvenementDto[];
}

export class DocumentDto {
  id: string;
  code: string;
  titre: string;
  phase: string;
  producteur: string;
  livrable: boolean;
  signature: boolean;
  recurrent: boolean;
  statut: string;
  echeance: string | null;
  /** Échéance effective : échéance propre ou date du jalon qui attend ce document. */
  echeance_effective: string | null;
  responsable: string;
  version: string;
  date_validation: string | null;
  lien_externe: string;
  notes: string;
  nb_versions: number;
  nb_scans: number;
}

export class VersionResumeDto {
  id: string;
  numero: string;
  resume_modif: string;
  auteur_type: 'humain' | 'agent';
  auteur: string;
  figee: boolean;
  cree_le: Date;
}

export class VersionDocumentDto extends VersionResumeDto {
  contenu: string;
}

export class DocumentDetailDto extends DocumentDto {
  description: string;
  modele: string | null;
  versions: VersionResumeDto[];
  version_courante: VersionDocumentDto | null;
}

export class PageEvenementsDto {
  total: number;
  page: number;
  par_page: number;
  elements: EvenementDto[];
}

export class SessionDto {
  id: string;
  depot: string | null;
  auteur: string;
  utilisateur_id: string | null;
  debut: Date;
  fin: Date | null;
  resume: string;
  notes: NoteSessionDto[];
  fonctionnalites: string[];
}

export class NoteSessionDto {
  ts: string;
  texte: string;
  fonctionnalites: string[];
}

export class EntreeReferentielDto {
  code: string;
  libelle: string;
  couleur: string;
  poids?: number;
}

/** Statuts, libellés français, couleurs et poids, pour l'affichage. */
export class ReferentielsDto {
  version_api: string;
  fuseau: string;
  statuts_fonctionnalite: EntreeReferentielDto[];
  statuts_depot: EntreeReferentielDto[];
  statuts_document: EntreeReferentielDto[];
  resultats_test: EntreeReferentielDto[];
  statuts_retour: EntreeReferentielDto[];
  priorites: EntreeReferentielDto[];
  types_retour: EntreeReferentielDto[];
  statuts_risque: EntreeReferentielDto[];
  statuts_action: EntreeReferentielDto[];
  decisions_changement: EntreeReferentielDto[];
  statuts_jalon: EntreeReferentielDto[];
  statuts_projet: EntreeReferentielDto[];
  producteurs: EntreeReferentielDto[];
  niveaux_alerte: EntreeReferentielDto[];
  roles_equipe: EntreeReferentielDto[];
  roles_projet: EntreeReferentielDto[];
  phases: EntreeReferentielDto[];
  libelles: Record<string, string>;
}

export class ImportBilanDto {
  projet: ProjetMinDto;
  bilan: Record<string, number>;
  erreurs_lecture: string[];
}

export class ProjetMinDto {
  id: string;
  code: string;
  nom: string;
}
