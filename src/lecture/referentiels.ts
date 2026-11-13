import * as R from '../indicateurs/referentiels';
import { EntreeReferentielDto, ReferentielsDto } from './vues.dto';
import { VERSION_API } from '../sante.controller';

/** Couleurs = variables CSS de dashboard/style.css (kit v1), reprises par le frontend. */
const COULEUR: Record<string, string> = {
  a_faire: '--s-a_faire', en_cours: '--s-en_cours', bloque: '--s-bloque', developpe: '--s-developpe', recette: '--s-recette',
  valide: '--s-valide', abandonne: '--s-abandonne', ok: '--ok', ko: '--ko', reserve: '--warn', non_teste: '--mute',
  nouveau: '--accent', resolu: '--ok', rejete: '--mute', haute: '--ko', moyenne: '--warn', basse: '--mute',
  a_produire: '--mute', en_revue: '--warn', signe: '--s-valide', sans_objet: '--s-abandonne',
  ouvert: '--warn', surveille: '--accent', survenu: '--ko', clos: '--mute', fait: '--ok', annule: '--mute',
  en_analyse: '--warn', accepte: '--ok', refuse: '--ko', reporte: '--mute', atteint: '--ok', a_venir: '--accent', en_retard: '--ko',
  livre: '--ok', cloture: '--mute', en_pause: '--warn', agent: '--accent', mixte: '--warn', humain: '--mute',
  bug: '--ko', evolution: '--accent', question: '--warn', remarque: '--mute',
};
const e = (codes: readonly string[], poids?: Record<string, number>): EntreeReferentielDto[] =>
  codes.map((code) => ({ code, libelle: R.LIBELLES[code] ?? code, couleur: COULEUR[code] ?? '--mute', ...(poids && code in poids ? { poids: poids[code] } : {}) }));

export function referentiels(phases: { code: string; titre: string }[]): ReferentielsDto {
  return {
    version_api: VERSION_API,
    fuseau: 'Africa/Abidjan',
    statuts_fonctionnalite: e(R.STATUTS_FONCTIONNALITE, R.POIDS_STATUT),
    statuts_depot: e(R.STATUTS_DEPOT, R.POIDS_STATUT),
    statuts_document: e(R.STATUTS_DOCUMENT, R.POIDS_DOCUMENT),
    resultats_test: e(R.RESULTATS_TEST),
    statuts_retour: e(R.STATUTS_RETOUR),
    priorites: e(['haute', 'moyenne', 'basse']),
    types_retour: e(['bug', 'evolution', 'question', 'remarque']),
    statuts_risque: e(R.STATUTS_RISQUE),
    statuts_action: e(R.STATUTS_ACTION),
    decisions_changement: e(R.DECISIONS_CHANGEMENT),
    statuts_jalon: e(['atteint', 'en_retard', 'a_venir']),
    statuts_projet: e(['en_cours', 'en_pause', 'livre', 'cloture']),
    producteurs: e(['agent', 'mixte', 'humain']),
    niveaux_alerte: e(['haute', 'moyenne', 'basse']),
    phases: phases.map((p) => ({ code: p.code, libelle: p.titre, couleur: '--accent' })),
    libelles: R.LIBELLES,
  };
}
