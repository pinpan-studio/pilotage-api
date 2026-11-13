// Exécute le kit v1 d'origine sur un projet et imprime ses indicateurs (référence des tests de portage).
// Usage : node test/kit-reference.mjs <code-projet> <AAAA-MM-JJ>
import { chargerProjet, calculer, verifier } from '../reference/kit-v1/scripts/lib/pilotage.mjs';
const [code, maintenant] = process.argv.slice(2);
const p = chargerProjet(code);
console.log(JSON.stringify({ indicateurs: calculer(p, { maintenant }), verification: verifier(p) }));
