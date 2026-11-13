// Référentiels repris de reference/kit-v1/scripts/lib/pilotage.mjs.
// Pondération des statuts pour le calcul de l'avancement.
export const POIDS_STATUT: Record<string, number> = {
  a_faire: 0,
  en_cours: 0.3,
  bloque: 0.3,
  developpe: 0.7,
  recette: 0.9,
  valide: 1,
};
export const STATUTS_FONCTIONNALITE = [...Object.keys(POIDS_STATUT), 'abandonne'];
export const STATUTS_DEPOT = ['a_faire', 'en_cours', 'bloque', 'developpe'];
export const LIBELLES: Record<string, string> = {
  a_faire: 'À faire', en_cours: 'En cours', bloque: 'Bloqué', developpe: 'Développé',
  recette: 'Recetté', valide: 'Validé client', abandonne: 'Abandonné',
  ok: 'OK', ko: 'KO', reserve: 'Réserve', non_teste: 'Non testé',
  nouveau: 'Nouveau', resolu: 'Résolu', rejete: 'Rejeté',
  haute: 'Haute', moyenne: 'Moyenne', basse: 'Basse',
  bug: 'Bug', evolution: 'Évolution', question: 'Question', remarque: 'Remarque',
  livre: 'Livré', cloture: 'Clôturé', en_pause: 'En pause',
  a_produire: 'À produire', en_revue: 'En revue', signe: 'Signé', sans_objet: 'Sans objet',
  ouvert: 'Ouvert', surveille: 'Surveillé', survenu: 'Survenu', clos: 'Clos',
  fait: 'Fait', annule: 'Annulé', en_analyse: 'En analyse', accepte: 'Accepté', refuse: 'Refusé', reporte: 'Reporté',
  atteint: 'Atteint', a_venir: 'À venir', en_retard: 'En retard',
  agent: 'Agent', mixte: 'Agent + humain', humain: 'Humain',
  admin: 'Administrateur', chef_projet: 'Chef de projet', developpeur: 'Développeur', client_lecteur: 'Lecteur',
  proposee: 'Proposée', acceptee: 'Acceptée', remplacee: 'Remplacée', rejetee: 'Rejetée',
};
export const STATUTS_DOCUMENT = ['a_produire', 'en_cours', 'en_revue', 'valide', 'signe', 'sans_objet'];
export const POIDS_DOCUMENT: Record<string, number> = { a_produire: 0, en_cours: 0.4, en_revue: 0.7, valide: 1, signe: 1 };
export const STATUTS_RISQUE = ['ouvert', 'surveille', 'survenu', 'clos'];
export const STATUTS_ACTION = ['a_faire', 'en_cours', 'fait', 'annule'];
export const DECISIONS_CHANGEMENT = ['en_analyse', 'accepte', 'refuse', 'reporte'];

export const RESULTATS_TEST = ['ok', 'ko', 'reserve', 'non_teste'];
export const STATUTS_RETOUR = ['nouveau', 'en_cours', 'resolu', 'rejete'];
export const RE_IDS = /\b(?:F|EX|RT|RC|ADR)-\d{2,4}\b/g;

