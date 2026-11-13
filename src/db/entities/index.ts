import * as o from './organisation';
import * as p from './projet';
import * as r from './recette';
import * as d from './documents';
import * as g from './gestion';
import * as j from './journal';
export * from './organisation'; export * from './projet'; export * from './recette';
export * from './documents'; export * from './gestion'; export * from './journal';
export const ENTITES = [o, p, r, d, g, j].flatMap((m) => Object.values(m)).filter((v) => typeof v === 'function');
