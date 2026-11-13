import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';
import { Base, BaseProjet, date, md, texte } from './base';

@Entity('projet')
@Unique(['organisation_id', 'code'])
export class Projet extends Base {
  @Column() code: string;
  @Column() nom: string;
  @Column({ default: '' }) client: string;
  @Column('uuid', { nullable: true }) chef_projet_id: string | null;
  /** Nom libre du chef de projet (import kit v1). */
  @Column(texte) chef_projet: string | null;
  @Column('text', { array: true, default: '{}' }) equipe: string[];
  @Column(md) description: string;
  @Column(date) date_debut: string | null;
  @Column(date) date_livraison_prevue: string | null;
  @Column({ type: 'varchar', default: 'en_cours' }) statut: 'en_cours' | 'en_pause' | 'livre' | 'cloture';
  @Column({ default: 8 }) seuil_rappel_doc: number;
  /** TDR / cahier des charges (Markdown), modifiable par les humains uniquement. */
  @Column(md) tdr: string;
  /** Une révision du périmètre ouverte par un humain autorise l'agent à modifier TDR et exigences. */
  @Column({ default: false }) revision_perimetre: boolean;
}

@Entity('membre_projet')
@Unique(['projet_id', 'utilisateur_id'])
export class MembreProjet extends BaseProjet {
  @Column('uuid') utilisateur_id: string;
  @Column({ type: 'varchar' }) role: 'chef_projet' | 'developpeur' | 'client_lecteur';
}

@Entity('depot')
@Unique(['projet_id', 'nom'])
export class Depot extends BaseProjet {
  @Column() nom: string;
  @Column({ default: '' }) url: string;
  @Column({ default: '' }) stack: string;
  @Column({ default: '' }) role: string;
  @Column({ default: 0 }) ordre: number;
}

@Entity('exigence')
@Unique(['projet_id', 'ref'])
export class Exigence extends BaseProjet {
  @Column() ref: string;
  @Column() titre: string;
  @Column({ default: '' }) section_tdr: string;
  @Column({ type: 'varchar', default: 'should' }) priorite: 'must' | 'should' | 'could';
  @Column(md) description: string;
  @Column({ default: 0 }) ordre: number;
}

@Entity('fonctionnalite')
@Unique(['projet_id', 'ref'])
export class Fonctionnalite extends BaseProjet {
  @Column() ref: string;
  @Column() titre: string;
  @Column({ default: '' }) jalon: string;
  @Column({ default: 1 }) poids: number;
  @Column({ type: 'varchar', default: 'a_faire' }) statut: string;
  @Column({ default: 'interne' }) origine: string;
  /** Description et critères d'acceptation (Markdown). */
  @Column(md) description: string;
  @Column(md) notes: string;
  @Column({ default: 0 }) ordre: number;
}

@Entity('fonctionnalite_exigence')
export class FonctionnaliteExigence {
  @PrimaryColumn('uuid') fonctionnalite_id: string;
  @PrimaryColumn('uuid') exigence_id: string;
}

@Entity('fonctionnalite_depot')
export class FonctionnaliteDepot {
  @PrimaryColumn('uuid') fonctionnalite_id: string;
  @PrimaryColumn('uuid') depot_id: string;
  @Column({ type: 'varchar', default: 'a_faire' }) statut: 'a_faire' | 'en_cours' | 'bloque' | 'developpe';
}

@Entity('doc_technique')
@Unique(['projet_id', 'chemin'])
export class DocTechnique extends BaseProjet {
  @Column('uuid', { nullable: true }) depot_id: string | null;
  @Column() chemin: string;
  @Column({ default: '' }) titre: string;
  @Column(md) contenu: string;
}

@Entity('adr')
@Unique(['projet_id', 'ref'])
export class Adr extends BaseProjet {
  @Column() ref: string;
  @Column({ default: '' }) titre: string;
  @Column(date) date: string | null;
  @Column({ default: 'proposee' }) statut: string;
  @Column('text', { array: true, default: '{}' }) depots: string[];
  @Column('text', { array: true, default: '{}' }) fonctionnalites: string[];
  @Column(md) contexte: string;
  @Column(md) decision: string;
  @Column(md) consequences: string;
  @Column(md) alternatives: string;
  /** Texte intégral (import kit v1). */
  @Column(md) contenu: string;
}

@Entity('changelog_entree')
export class ChangelogEntree extends BaseProjet {
  @Column({ default: 'Non publié' }) version: string;
  @Column(date) date: string | null;
  @Column({ type: 'varchar' }) type: 'ajoute' | 'modifie' | 'corrige' | 'retire';
  @Column('text') texte: string;
  @Column('uuid', { nullable: true }) fonctionnalite_id: string | null;
  @Column({ default: 0 }) ordre: number;
}

@Entity('rapport')
export class Rapport extends BaseProjet {
  @Column(date) date: string | null;
  @Column({ default: '' }) periode: string;
  @Column(md) contenu: string;
}
