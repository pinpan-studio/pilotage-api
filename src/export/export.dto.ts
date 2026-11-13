export class BlocDiffDto { type: 'ajout' | 'retrait' | 'commun'; texte: string; }
export class DiffDocumentDto { de: string; a: string; ajouts: number; retraits: number; blocs: BlocDiffDto[]; }
