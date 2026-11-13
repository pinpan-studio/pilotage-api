import { Projet } from '../db/entities';
import { LectureService } from '../lecture/lecture.service';

export interface ResultatRecherche { type: string; ref: string; titre: string; extrait: string; rang: number }

/** Recherche plein texte PostgreSQL (configuration « french »), sur les contenus principaux du projet. */
export async function rechercher(l: LectureService, p: Projet, texte: string): Promise<ResultatRecherche[]> {
  const sources = `
    SELECT 'fonctionnalite' type, ref, titre, titre || ' ' || notes doc FROM fonctionnalite WHERE projet_id = $1 AND supprime_le IS NULL
    UNION ALL SELECT 'exigence', ref, titre, titre || ' ' || description FROM exigence WHERE projet_id = $1 AND supprime_le IS NULL
    UNION ALL SELECT 'retour', ref, left(retour, 80), retour || ' ' || "analyse" || ' ' || "action" FROM retour_client WHERE projet_id = $1 AND supprime_le IS NULL
    UNION ALL SELECT 'doc_technique', chemin, titre, contenu FROM doc_technique WHERE projet_id = $1 AND supprime_le IS NULL
    UNION ALL SELECT 'adr', ref, titre, contenu FROM adr WHERE projet_id = $1 AND supprime_le IS NULL
    UNION ALL SELECT 'reunion', coalesce(date::text, ''), titre, contenu FROM reunion WHERE projet_id = $1 AND supprime_le IS NULL
    UNION ALL SELECT 'session', to_char(debut, 'YYYY-MM-DD'), auteur, resume FROM session_dev WHERE projet_id = $1 AND supprime_le IS NULL
    UNION ALL SELECT * FROM (SELECT DISTINCT ON (d.id) 'document' type, d.code ref, coalesce(t.titre, d.titre, d.code) titre, v.contenu doc
      FROM document d LEFT JOIN type_document t ON t.id = d.type_document_id JOIN version_document v ON v.document_id = d.id
      WHERE d.projet_id = $1 AND d.supprime_le IS NULL ORDER BY d.id, v.cree_le DESC) docs`;
  const rows = await (l as any).em.query(`
    WITH s AS (${sources}), q AS (SELECT websearch_to_tsquery('french', $2) q)
    SELECT s.type, s.ref, s.titre, ts_rank(to_tsvector('french', s.doc), q.q) rang,
           ts_headline('french', s.doc, q.q, 'MaxWords=18, MinWords=6, StartSel=**, StopSel=**') extrait
    FROM s, q WHERE to_tsvector('french', s.doc) @@ q.q ORDER BY rang DESC LIMIT 20`, [p.id, texte]);
  return rows.map((r: any) => ({ ...r, extrait: String(r.extrait).replace(/\s+/g, ' '), rang: Number(r.rang) }));
}
