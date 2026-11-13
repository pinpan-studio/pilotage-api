import { ReglesAgent } from './regles-agent';
import { Acteur } from './acteur';

const agent: Acteur = { utilisateur_id: 'u', organisation_id: 'o', nom: 'dev', role: 'agent', auteur_type: 'agent' };
const chef: Acteur = { ...agent, role: 'chef_projet', auteur_type: 'humain' };

describe('ReglesAgent', () => {
  it('interdit valide, autorise recette seulement si tous les tests sont OK', () => {
    expect(() => ReglesAgent.statutFonctionnalite(agent, 'valide', true)).toThrow(/jamais valider/);
    expect(() => ReglesAgent.statutFonctionnalite(agent, 'recette', false)).toThrow(/tous les cas de test/);
    expect(() => ReglesAgent.statutFonctionnalite(agent, 'recette', true)).not.toThrow();
    expect(() => ReglesAgent.statutFonctionnalite(chef, 'valide', false)).not.toThrow();
  });
  it('document : jamais valide ni signe ; pas de document producteur humain', () => {
    expect(() => ReglesAgent.statutDocument(agent, 'signe')).toThrow(/seul un chef de projet/);
    expect(() => ReglesAgent.statutDocument(agent, 'valide')).toThrow();
    expect(() => ReglesAgent.statutDocument(agent, 'en_revue')).not.toThrow();
    expect(() => ReglesAgent.documentProducteur(agent, 'humain')).toThrow();
  });
  it('périmètre, suppression, décision de changement', () => {
    expect(() => ReglesAgent.perimetre(agent, false)).toThrow(/révision du périmètre/);
    expect(() => ReglesAgent.perimetre(agent, true)).not.toThrow();
    expect(() => ReglesAgent.suppression(agent)).toThrow();
    expect(() => ReglesAgent.suppression(chef)).not.toThrow();
    expect(() => ReglesAgent.decisionChangement(agent, 'accepte')).toThrow();
    expect(() => ReglesAgent.decisionChangement(agent, 'en_analyse')).not.toThrow();
  });
});
