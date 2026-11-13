import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Acteur, ActeurCourant } from '../common/acteur';
import { AccesService } from '../common/acces.service';

export class NotificationDto {
  /** Identifiant stable (pour marquer comme lu côté client). */
  id: string;
  projet: string; projet_nom: string;
  type: 'document_en_revue' | 'changement_a_decider' | 'fonctionnalite_a_valider' | 'retour_nouveau' | 'jalon_proche' | 'action_en_retard';
  titre: string; detail: string;
  /** Chemin dans l'interface web. */
  lien: string;
  date: string | null;
  priorite: 'haute' | 'moyenne' | 'basse';
}

/** « À traiter » : ce qui attend l'utilisateur, selon son rôle sur chaque projet, calculé depuis l'état réel. */
@ApiTags('notifications') @ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(@InjectDataSource() private readonly db: DataSource, private readonly acces: AccesService) {}

  @Get() @ApiOkResponse({ type: [NotificationDto] })
  async lister(@ActeurCourant() a: Acteur): Promise<NotificationDto[]> {
    const projets = await this.acces.lister(a);
    const out: NotificationDto[] = [];
    const q = (sql: string, p: unknown[]) => this.db.query(sql, p);
    const auj = new Date().toISOString().slice(0, 10);
    const dans7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    for (const p of projets) {
      const role = await this.acces.roleSurProjet(a, p);
      if (role === 'client_lecteur') continue;
      const chef = role === 'chef_projet';
      const base = { projet: p.code, projet_nom: p.nom };
      const L = (s: string) => `/projets/${p.code}/${s}`;
      if (chef) {
        for (const d of await q(`SELECT d.code, coalesce(d.titre, t.titre, d.code) titre, d.modifie_le FROM document d LEFT JOIN type_document t ON t.id = d.type_document_id WHERE d.projet_id = $1 AND d.statut = 'en_revue' AND d.supprime_le IS NULL`, [p.id]))
          out.push({ ...base, id: `doc:${p.id}:${d.code}:${new Date(d.modifie_le).getTime()}`, type: 'document_en_revue', titre: `${d.code} à valider`, detail: d.titre, lien: L(`livrables/${d.code}`), date: new Date(d.modifie_le).toISOString(), priorite: 'moyenne' });
        for (const c of await q(`SELECT ref, titre, date FROM changement WHERE projet_id = $1 AND decision = 'en_analyse' AND supprime_le IS NULL`, [p.id]))
          out.push({ ...base, id: `dc:${p.id}:${c.ref}`, type: 'changement_a_decider', titre: `${c.ref} à décider`, detail: c.titre, lien: L('registres'), date: c.date, priorite: 'haute' });
        for (const f of await q(`SELECT ref, titre, modifie_le FROM fonctionnalite WHERE projet_id = $1 AND statut = 'recette' AND supprime_le IS NULL`, [p.id]))
          out.push({ ...base, id: `f:${p.id}:${f.ref}:recette`, type: 'fonctionnalite_a_valider', titre: `${f.ref} recettée, à valider`, detail: f.titre, lien: L(`fonctionnalites/${f.ref}`), date: new Date(f.modifie_le).toISOString(), priorite: 'moyenne' });
      }
      for (const r of await q(`SELECT ref, retour, type, priorite, date, source FROM retour_client WHERE projet_id = $1 AND statut = 'nouveau' AND supprime_le IS NULL`, [p.id]))
        out.push({ ...base, id: `rc:${p.id}:${r.ref}`, type: 'retour_nouveau', titre: `Nouveau retour ${r.ref}${r.source === 'portail client' ? ' (client)' : ''}`, detail: String(r.retour).slice(0, 140), lien: L('registres'), date: r.date, priorite: r.priorite === 'haute' || r.type === 'bug' ? 'haute' : 'moyenne' });
      for (const j of await q(`SELECT ref, nom, date_prevue FROM jalon WHERE projet_id = $1 AND date_reelle IS NULL AND date_prevue IS NOT NULL AND date_prevue <= $2 AND supprime_le IS NULL`, [p.id, dans7]))
        out.push({ ...base, id: `j:${p.id}:${j.ref}`, type: 'jalon_proche', titre: `${j.ref} ${j.date_prevue < auj ? 'dépassé' : 'proche'}`, detail: `${j.nom} — prévu le ${j.date_prevue}`, lien: L('registres'), date: j.date_prevue, priorite: j.date_prevue < auj ? 'haute' : 'moyenne' });
      for (const t of await q(`SELECT ref, action, echeance, responsable FROM action WHERE projet_id = $1 AND statut IN ('a_faire', 'en_cours') AND echeance < $2 AND supprime_le IS NULL`, [p.id, auj]))
        out.push({ ...base, id: `a:${p.id}:${t.ref}`, type: 'action_en_retard', titre: `${t.ref} en retard`, detail: `${t.action}${t.responsable ? ' — ' + t.responsable : ''} (échéance ${t.echeance})`, lien: L(`taches/${t.ref}`), date: t.echeance, priorite: 'basse' });
    }
    const rang = { haute: 0, moyenne: 1, basse: 2 };
    return out.sort((x, y) => rang[x.priorite] - rang[y.priorite] || String(y.date ?? '').localeCompare(String(x.date ?? '')));
  }
}
