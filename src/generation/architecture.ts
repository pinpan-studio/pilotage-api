/** Construction du flowchart d'architecture (Mermaid) à partir des dépôts du projet et de leurs technologies. */
export interface DepotArchi { nom: string; stack: string; role: string; url?: string }

const NATURE: [RegExp, 'mobile' | 'web' | 'api' | 'service'][] = [
  [/mobile|flutter|react[- ]native|ios|android|kotlin|swift/i, 'mobile'],
  [/web|front|angular|react|vue|next|nuxt|svelte|html|site|portail/i, 'web'],
  [/api|back|nest|express|laravel|symfony|django|flask|fastapi|spring|rails|\.net|go\b|serveur|server/i, 'api'],
];
const BASES: [RegExp, string][] = [[/postgres|neon|supabase/i, 'PostgreSQL'], [/mysql|maria/i, 'MySQL'], [/mongo/i, 'MongoDB'], [/sqlite/i, 'SQLite'], [/oracle/i, 'Oracle'], [/sql ?server|mssql/i, 'SQL Server']];
const STOCKAGES: [RegExp, string][] = [[/vercel blob|blob/i, 'Vercel Blob'], [/\bs3\b|minio/i, 'Stockage S3'], [/firebase storage|cloud storage/i, 'Stockage cloud']];
const HEBERGEURS: [RegExp, string][] = [[/vercel/i, 'Vercel'], [/aws|lambda/i, 'AWS'], [/azure/i, 'Azure'], [/gcp|google cloud|cloud run/i, 'Google Cloud'], [/docker|kubernetes|k8s/i, 'Conteneurs']];

export function natureDepot(d: DepotArchi) {
  const texte = `${d.nom} ${d.role} ${d.stack}`;
  // Le nom et le rôle priment sur la pile (ex. « pilotage-web » en Angular sur Vercel).
  for (const [re, n] of NATURE) if (re.test(`${d.nom} ${d.role}`)) return n;
  for (const [re, n] of NATURE) if (re.test(texte)) return n;
  return 'service';
}
const id = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '_');
const echap = (s: string) => s.replace(/"/g, "'").replace(/[<>]/g, '');

/** Flowchart Mermaid : utilisateurs → applications → services → données, avec styles par nature. */
export function flowchartArchitecture(projet: string, depots: DepotArchi[], opts: { agentIa?: boolean } = {}) {
  const pile = depots.map((d) => d.stack).join(' ');
  const trouve = (l: [RegExp, string][]) => [...new Set(l.filter(([re]) => re.test(pile)).map(([, n]) => n))];
  const bases = trouve(BASES), stockages = trouve(STOCKAGES), hebergeurs = trouve(HEBERGEURS);
  const par = { mobile: [] as DepotArchi[], web: [] as DepotArchi[], api: [] as DepotArchi[], service: [] as DepotArchi[] };
  for (const d of depots) par[natureDepot(d)].push(d);
  const noeud = (d: DepotArchi, cls: string) => `    ${id(d.nom)}["<b>${echap(d.nom)}</b><br/><small>${echap(d.stack || d.role || 'à préciser')}</small>"]:::${cls}`;
  const L = ['```mermaid', 'flowchart LR', '  U(["Utilisateurs"]):::acteur'];
  if (opts.agentIa) L.push('  IA(["Assistants IA<br/><small>MCP</small>"]):::agent');
  const clients = [...par.web, ...par.mobile];
  if (clients.length) { L.push('  subgraph C["Applications"]', '    direction TB', ...par.web.map((d) => noeud(d, 'web')), ...par.mobile.map((d) => noeud(d, 'mobile')), '  end'); }
  const services = [...par.api, ...par.service];
  if (services.length) { L.push(`  subgraph S["Services${hebergeurs.length ? ' · ' + hebergeurs.join(', ') : ''}"]`, '    direction TB', ...par.api.map((d) => noeud(d, 'api')), ...par.service.map((d) => noeud(d, 'service')), '  end'); }
  const donnees = [...bases.map((b) => ({ id: 'DB_' + id(b), l: b, cls: 'donnees' })), ...stockages.map((s) => ({ id: 'ST_' + id(s), l: s, cls: 'stockage' }))];
  if (donnees.length) { L.push('  subgraph D["Données"]', '    direction TB', ...donnees.map((x) => `    ${x.id}[("${x.l}")]:::${x.cls}`), '  end'); }
  // Liens : utilisateurs → applications (ou services), applications → services, services → données.
  const cibleUtil = clients.length ? clients : services;
  for (const c of cibleUtil) L.push(`  U --> ${id(c.nom)}`);
  if (!cibleUtil.length) L.push('  U --> S');
  for (const c of clients) for (const s of par.api.length ? par.api : services) L.push(`  ${id(c.nom)} -->|HTTPS| ${id(s.nom)}`);
  for (const s of services.length ? services : clients) for (const x of donnees) L.push(`  ${id(s.nom)} --> ${x.id}`);
  if (opts.agentIa) for (const s of par.api.length ? par.api : services) L.push(`  IA -.->|MCP| ${id(s.nom)}`);
  L.push('  classDef acteur fill:#e8f1ff,stroke:#5b8def,color:#1d3d77',
    '  classDef agent fill:#f3e8ff,stroke:#9b6ce6,color:#4a2a7a',
    '  classDef web fill:#e3f6f4,stroke:#2a9d8f,color:#134e48',
    '  classDef mobile fill:#e6f4ea,stroke:#3c9d5d,color:#1e4d2c',
    '  classDef api fill:#fff4e0,stroke:#e09f3e,color:#6b4710',
    '  classDef service fill:#f1f1f4,stroke:#8a8aa3,color:#3b3b52',
    '  classDef donnees fill:#fde8e8,stroke:#d9534f,color:#6e1f1d',
    '  classDef stockage fill:#fdeef7,stroke:#c2549d,color:#5e1c47', '```');
  void projet;
  return L.join('\n');
}

/** Rendu texte d'un flowchart pour les exports Word / PDF (les schémas y sont décrits en liste). */
export function decrireMermaid(code: string): string {
  const libelles = new Map<string, string>();
  for (const m of code.matchAll(/(\w+)\s*(?:\[\(|\(\[|\[|\(|\{)"?([^"\]\)\}]+)"?(?:\)\]|\]\)|\]|\)|\})/g)) libelles.set(m[1], m[2].replace(/<br\/?>/g, ' — ').replace(/<[^>]+>/g, '').trim());
  const liens: string[] = [];
  for (const l of code.split('\n')) {
    const m = /^\s*(\w+)[^-.\n]*?\s*(-->|-\.->|==>)\s*(?:\|([^|]+)\|\s*)?(\w+)/.exec(l);
    if (m) liens.push(`${libelles.get(m[1]) ?? m[1]} → ${libelles.get(m[4]) ?? m[4]}${m[3] ? ` (${m[3]})` : ''}`);
  }
  if (!liens.length) return '_Schéma consultable dans Pilotage._';
  return `_Schéma (consultable en couleur dans Pilotage) :_\n\n${liens.map((x) => `- ${x}`).join('\n')}`;
}
