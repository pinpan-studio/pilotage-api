import { Acteur } from './acteur';
import { refuse } from './erreurs';

/**
 * Restrictions dures du rôle « agent » (§4), appliquées par l'API quel que soit le prompt.
 * Chaque fonction lève une ForbiddenException explicite en français.
 */
export const ReglesAgent = {
  statutFonctionnalite(a: Acteur, statut: string, testsTousOk: boolean) {
    if (a.role !== 'agent') return;
    if (statut === 'valide') throw refuse("l'agent ne peut jamais valider une fonctionnalité : la validation revient au chef de projet.");
    if (statut === 'recette' && !testsTousOk)
      throw refuse("passage en recette impossible : tous les cas de test de la fonctionnalité doivent être OK dans la dernière campagne.");
  },
  statutDocument(a: Acteur, statut: string) {
    if (a.role !== 'agent') return;
    if (!['a_produire', 'en_cours', 'en_revue'].includes(statut))
      throw refuse(`l'agent ne peut pas passer un document à « ${statut} » : seul un chef de projet peut valider ou signer un document.`);
  },
  documentProducteur(a: Acteur, producteur: string) {
    if (a.role === 'agent' && producteur === 'humain') throw refuse("ce document est produit par un humain : l'agent ne peut pas le rédiger.");
  },
  perimetre(a: Acteur, revisionOuverte: boolean) {
    if (a.role === 'agent' && !revisionOuverte)
      throw refuse("l'agent ne peut pas modifier le TDR ni les exigences sans « révision du périmètre » ouverte par un humain.");
  },
  suppression(a: Acteur) {
    if (a.role === 'agent') throw refuse("l'agent ne peut rien supprimer : la suppression est réservée aux humains.");
  },
  decisionChangement(a: Acteur, decision: string) {
    if (a.role === 'agent' && decision !== 'en_analyse') throw refuse("l'agent ne peut pas décider d'une demande de changement (décision réservée aux humains).");
  },
};
