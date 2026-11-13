// Restauration d'une sauvegarde produite par scripts/sauvegarde.mjs.
//   DATABASE_URL=<base cible, vide de préférence> BLOB_READ_WRITE_TOKEN=<store cible> node scripts/restauration.mjs <dossier> [--fichiers-seulement|--base-seulement]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { put } from '@vercel/blob';

const [dossier, option] = process.argv.slice(2);
if (!dossier) throw new Error('Usage : node scripts/restauration.mjs <dossier> [--fichiers-seulement|--base-seulement]');
const m = JSON.parse(readFileSync(join(dossier, 'manifeste.json'), 'utf8'));
if (option !== '--fichiers-seulement') {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL manquante.');
  execFileSync('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--dbname', process.env.DATABASE_URL, join(dossier, m.base)], { stdio: 'inherit' });
  console.log('Base restaurée.');
}
if (option !== '--base-seulement') {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN manquant.');
  for (const f of m.fichiers) {
    await put(f.cle, readFileSync(join(dossier, 'fichiers', f.cle)), { access: 'private', contentType: f.type, token, addRandomSuffix: false, allowOverwrite: true });
  }
  console.log(`Fichiers restaurés : ${m.fichiers.length}`);
}
