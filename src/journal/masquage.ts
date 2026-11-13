/** Masque les secrets évidents (repris de kit-claude/hooks/commun.mjs ; appliqué aussi côté serveur, par défense en profondeur). */
export function masquer(texte: string) {
  return String(texte)
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/=-]+/gi, '$1 ***')
    .replace(/((?:password|passwd|pwd|secret|token|api[_-]?key|authorization)\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi, '$1***')
    .replace(/(\s-p)([^\s-]\S{2,})/g, '$1***')
    .replace(/\b(ghp|gho|github_pat|sk|pk|xox[abp]|plt)[-_][A-Za-z0-9_\-]{10,}/g, '***')
    .replace(/(https?:\/\/)[^\s/:@]+:[^\s/@]+@/g, '$1***@');
}
