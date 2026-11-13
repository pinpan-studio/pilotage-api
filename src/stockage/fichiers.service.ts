import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import * as E from '../db/entities';
import { Acteur } from '../common/acteur';
import { AccesService } from '../common/acces.service';
import { HistoriqueService } from '../common/historique.service';
import { introuvable, invalide, refuse } from '../common/erreurs';
import { ReglesAgent } from '../common/regles-agent';
import { StockageService } from './stockage.service';

export const CATEGORIES = ['tdr', 'scan_signe', 'annexe', 'export'] as const;
/** Vercel limite le corps d'une requête à 4,5 Mo : 4 Mo par fichier sur Vercel (téléversement direct prévu en phase 2). */
export const TAILLE_MAX = (process.env.VERCEL ? 4 : 25) * 1024 * 1024;
const TYPES_AUTORISES = /^(application\/pdf|image\/(png|jpeg|webp)|text\/(plain|markdown|csv)|application\/(zip|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|msword|vnd\.ms-excel))$/;
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 120) || 'fichier';

@Injectable()
export class FichiersService {
  constructor(@InjectDataSource() private readonly db: DataSource, private readonly acces: AccesService, private readonly hist: HistoriqueService, private readonly stockage: StockageService) {}

  async deposer(a: Acteur, code: string, f: { nom: string; type: string; contenu: Buffer }, categorie: string, codeDocument?: string) {
    if (!CATEGORIES.includes(categorie as any)) throw invalide(`catégorie « ${categorie} » (attendu : ${CATEGORIES.join(', ')}).`);
    if (a.role === 'agent' && ['scan_signe', 'tdr'].includes(categorie)) throw refuse("l'agent ne peut pas déposer de scan signé ni de TDR.");
    if (!TYPES_AUTORISES.test(f.type)) throw invalide(`type de fichier « ${f.type} » non autorisé.`);
    if (f.contenu.length > TAILLE_MAX) throw invalide(`fichier trop volumineux (${TAILLE_MAX / 1024 / 1024} Mo maximum).`);
    const p = await this.acces.projet(a, code);
    await this.acces.exigerEcriture(a, p);
    let document_id: string | null = null;
    if (codeDocument) {
      const d = await this.db.manager.findOneBy(E.Document, { projet_id: p.id, code: codeDocument });
      if (!d) throw introuvable(`document ${codeDocument}`);
      document_id = d.id;
    }
    if (categorie === 'scan_signe' && !document_id) throw invalide('un scan signé doit être rattaché à un document.');
    if (process.env.VERCEL && this.stockage.impl.nom === 'local') throw invalide('stockage non configuré : BLOB_READ_WRITE_TOKEN manquant sur Vercel.');
    const cle = `${p.organisation_id}/${p.id}/${categorie}/${randomUUID()}-${slug(f.nom)}`;
    await this.stockage.impl.deposer(cle, f.contenu, f.type);
    return this.db.transaction(async (em) => {
      const r = await em.save(E.Fichier, em.create(E.Fichier, {
        organisation_id: p.organisation_id, projet_id: p.id, cree_par: a.utilisateur_id, document_id, nom: f.nom,
        type_mime: f.type, taille: String(f.contenu.length), cle_stockage: cle, categorie: categorie as any,
      }));
      await this.hist.tracer(em, a, 'fichier', null, { id: r.id, nom: r.nom, categorie, document_id });
      return r;
    });
  }

  async lister(a: Acteur, code: string) {
    const p = await this.acces.projet(a, code);
    return this.db.manager.find(E.Fichier, { where: { projet_id: p.id }, order: { cree_le: 'DESC' } });
  }

  async lire(a: Acteur, code: string, id: string) {
    const p = await this.acces.projet(a, code);
    const f = await this.db.manager.findOneBy(E.Fichier, { id, projet_id: p.id });
    if (!f) throw introuvable('fichier');
    const c = await this.stockage.impl.lire(f.cle_stockage);
    if (!c) throw introuvable('contenu du fichier dans le stockage');
    return { fichier: f, contenu: c };
  }

  /** Suppression logique (le contenu reste dans le stockage pour l'audit). Humains uniquement. */
  async supprimer(a: Acteur, code: string, id: string) {
    ReglesAgent.suppression(a);
    const p = await this.acces.projet(a, code);
    await this.acces.exigerChefProjet(a, p, 'supprimer un fichier');
    const f = await this.db.manager.findOneBy(E.Fichier, { id, projet_id: p.id });
    if (!f) throw introuvable('fichier');
    await this.db.transaction(async (em) => {
      await em.softDelete(E.Fichier, { id });
      await this.hist.tracer(em, a, 'fichier', { id, supprime: false }, { id, supprime: true }, { projet_id: p.id });
    });
  }
}
