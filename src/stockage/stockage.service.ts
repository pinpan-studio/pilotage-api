import { Injectable, Logger } from '@nestjs/common';
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { del, get, put } from '@vercel/blob';

export interface ContenuLu { flux: Readable; type: string; taille: number }

export interface Stockage {
  readonly nom: 'vercel-blob' | 'local';
  deposer(cle: string, contenu: Buffer, type: string): Promise<void>;
  lire(cle: string): Promise<ContenuLu | null>;
  supprimer(cle: string): Promise<void>;
}

/** Vercel Blob en accès PRIVÉ : les fichiers ne sont lisibles qu'au travers de l'API (contrôle des droits). */
export class StockageVercelBlob implements Stockage {
  readonly nom = 'vercel-blob' as const;
  constructor(private readonly token: string) {}
  async deposer(cle: string, contenu: Buffer, type: string) {
    await put(cle, contenu, { access: 'private', contentType: type, token: this.token, addRandomSuffix: false, allowOverwrite: false });
  }
  async lire(cle: string): Promise<ContenuLu | null> {
    const r = await get(cle, { access: 'private', token: this.token });
    if (!r || r.statusCode !== 200) return null;
    return { flux: Readable.fromWeb(r.stream as any), type: r.blob.contentType, taille: r.blob.size };
  }
  async supprimer(cle: string) { await del(cle, { token: this.token }); }
}

/** Disque local (développement, tests, poste hors ligne). */
export class StockageLocal implements Stockage {
  readonly nom = 'local' as const;
  constructor(private readonly racine: string) {}
  private chemin(cle: string) {
    const c = resolve(this.racine, cle);
    if (!c.startsWith(resolve(this.racine) + '/')) throw new Error('Clé de stockage invalide.');
    return c;
  }
  async deposer(cle: string, contenu: Buffer, type: string) {
    const c = this.chemin(cle);
    mkdirSync(dirname(c), { recursive: true });
    writeFileSync(c, contenu);
    writeFileSync(`${c}.type`, type);
  }
  async lire(cle: string): Promise<ContenuLu | null> {
    const c = this.chemin(cle);
    if (!existsSync(c)) return null;
    const type = existsSync(`${c}.type`) ? readFileSync(`${c}.type`, 'utf8') : 'application/octet-stream';
    return { flux: createReadStream(c), type, taille: statSync(c).size };
  }
  async supprimer(cle: string) { rmSync(this.chemin(cle), { force: true }); rmSync(`${this.chemin(cle)}.type`, { force: true }); }
}

@Injectable()
export class StockageService {
  private readonly log = new Logger('Stockage');
  readonly impl: Stockage;
  constructor() {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    this.impl = token ? new StockageVercelBlob(token) : new StockageLocal(process.env.STOCKAGE_LOCAL_DIR ?? join(process.cwd(), 'stockage'));
    if (!token && process.env.NODE_ENV === 'production') this.log.warn('BLOB_READ_WRITE_TOKEN absent : stockage sur disque local (non persistant sur la plupart des hébergeurs).');
    this.log.log(`Stockage des fichiers : ${this.impl.nom}`);
  }
}
