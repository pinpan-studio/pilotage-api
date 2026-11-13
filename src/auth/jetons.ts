import { createHash, randomBytes } from 'node:crypto';

/** Les jetons (API et rafraîchissement) sont aléatoires et à haute entropie : SHA-256 suffit pour les stocker. */
export const hacher = (jeton: string) => createHash('sha256').update(jeton).digest('hex');

export const PREFIXE_JETON_API = 'plt_';
/** Génère un jeton d'API « plt_<8 car. visibles>_<secret> ». */
export function genererJetonApi() {
  const visible = randomBytes(4).toString('hex');
  const jeton = `${PREFIXE_JETON_API}${visible}_${randomBytes(24).toString('base64url')}`;
  return { jeton, prefixe: `${PREFIXE_JETON_API}${visible}`, hache: hacher(jeton) };
}
export const prefixeDe = (jeton: string) => jeton.split('_').slice(0, 2).join('_');
export const genererJetonRafraichissement = () => randomBytes(32).toString('base64url');
