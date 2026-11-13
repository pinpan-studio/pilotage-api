import * as E from '../db/entities';

export class ModeleResumeDto { id: string; code: string; }
export class CatalogueDto { phases: E.PhaseDocument[]; types: E.TypeDocument[]; modeles: ModeleResumeDto[]; }
export class TexteDto { contenu: string; }
export class ResultatLigneDto { test: string; resultat: string; commentaire: string; }
export class CampagneDetailDto extends E.Campagne { resultats: ResultatLigneDto[]; }
export class RetourDetailDto extends E.RetourClient { fonctionnalites: string[]; }
export class DocTechniqueDto extends E.DocTechnique { depot: string | null; }
