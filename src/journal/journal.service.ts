import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Acteur } from '../common/acteur';
import { AccesService } from '../common/acces.service';
import { EvenementJournalDto } from './journal.dto';
import { masquer } from './masquage';

const RE_IDS = /\b(?:F|EX|RT|RC|ADR)-\d{2,4}\b/g;

@Injectable()
export class JournalService {
  constructor(@InjectDataSource() private readonly db: DataSource, private readonly acces: AccesService) {}

  /** Enregistre un lot d'événements ; idempotent grâce à cle_idempotence (ON CONFLICT DO NOTHING). */
  async enregistrer(a: Acteur, evenements: EvenementJournalDto[]) {
    const rejetes: { cle_idempotence: string; raison: string }[] = [];
    const projets = new Map<string, { id: string; organisation_id: string; depots: Map<string, string> } | null>();
    const lignes: any[] = [];
    for (const e of evenements) {
      if (!projets.has(e.projet)) {
        try {
          const p = await this.acces.projet(a, e.projet);
          await this.acces.exigerEcriture(a, p);
          const ds = await this.db.query('SELECT id, nom FROM depot WHERE projet_id = $1 AND supprime_le IS NULL', [p.id]);
          projets.set(e.projet, { id: p.id, organisation_id: p.organisation_id, depots: new Map(ds.map((d: any) => [d.nom, d.id])) });
        } catch { projets.set(e.projet, null); }
      }
      const p = projets.get(e.projet);
      if (!p) { rejetes.push({ cle_idempotence: e.cle_idempotence, raison: `projet « ${e.projet} » inaccessible avec ce jeton` }); continue; }
      const message = masquer(e.message ?? '').slice(0, 1000);
      const commande = masquer(e.commande ?? '').slice(0, 2000);
      const foncs = [...new Set([...(e.fonctionnalites ?? []), ...(`${message} ${commande}`.match(RE_IDS) ?? [])])].filter((x) => /^[A-Z]+-\d{2,4}$/.test(x));
      lignes.push([e.cle_idempotence, p.organisation_id, p.id, p.depots.get(e.depot) ?? null, a.utilisateur_id, a.utilisateur_id,
        e.auteur || a.nom, e.session_externe ?? '', new Date(e.ts), e.evt, e.outil ?? '', e.fichier ?? '', commande, e.hash ?? '', message, foncs]);
    }
    let enregistres = 0;
    if (lignes.length) {
      // Insertion groupée ; les doublons (renvois après coupure) sont ignorés.
      const cols = 16;
      const valeurs = lignes.map((_, i) => `(${Array.from({ length: cols }, (_, k) => `$${i * cols + k + 1}`).join(',')})`).join(',');
      const r = await this.db.query(
        `INSERT INTO evenement_journal (cle_idempotence, organisation_id, projet_id, depot_id, utilisateur_id, cree_par, auteur, session_externe, ts, evt, outil, fichier, commande, hash, message, fonctionnalites)
         VALUES ${valeurs} ON CONFLICT (cle_idempotence) DO NOTHING RETURNING id`, lignes.flat());
      enregistres = r.length;
    }
    return { recus: evenements.length, enregistres, doublons: lignes.length - enregistres, rejetes };
  }
}
