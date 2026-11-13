// Sauvegarde complète : base PostgreSQL (pg_dump, format custom) + tous les fichiers Vercel Blob.
//   DATABASE_URL=… BLOB_READ_WRITE_TOKEN=… node scripts/sauvegarde.mjs [dossier]
// Restauration : node scripts/restauration.mjs <dossier> (voir docs/SAUVEGARDE.md).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { get, list } from '@vercel/blob';

const horodatage = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dossier = process.argv[2] ?? join('sauvegardes', horodatage);
mkdirSync(dossier, { recursive: true });
const manifeste = { cree_le: new Date().toISOString(), base: null, fichiers: [] };

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL manquante.');
const dump = join(dossier, 'base.dump');
execFileSync('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', dump, process.env.DATABASE_URL], { stdio: 'inherit' });
manifeste.base = 'base.dump';
console.log(`Base : ${dump}`);

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (token) {
  let curseur;
  do {
    const page = await list({ token, cursor: curseur, limit: 1000 });
    for (const b of page.blobs) {
      const r = await get(b.pathname, { access: 'private', token });
      if (!r || r.statusCode !== 200) { console.warn(`Ignoré : ${b.pathname}`); continue; }
      const cible = join(dossier, 'fichiers', b.pathname);
      mkdirSync(dirname(cible), { recursive: true });
      writeFileSync(cible, Buffer.from(await new Response(r.stream).arrayBuffer()));
      manifeste.fichiers.push({ cle: b.pathname, taille: b.size, type: r.blob.contentType });
    }
    curseur = page.hasMore ? page.cursor : undefined;
  } while (curseur);
  console.log(`Fichiers : ${manifeste.fichiers.length}`);
} else console.warn('BLOB_READ_WRITE_TOKEN absent : fichiers non sauvegardés.');

writeFileSync(join(dossier, 'manifeste.json'), JSON.stringify(manifeste, null, 2));
console.log(`Sauvegarde terminée : ${dossier}`);
