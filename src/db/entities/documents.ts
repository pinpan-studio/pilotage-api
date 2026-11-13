import { Column, Entity, Index, Unique } from 'typeorm';
import { Base, BaseProjet, date, md, texte } from './base';

/** Catalogue de référence (modeles/documents/catalogue.yaml). Organisation nulle = catalogue commun. */
@Entity('type_document')
@Unique(['organisation_id', 'code'])
export class TypeDocument extends Base {
  @Column() code: string;
  @Column() titre: string;
  @Column() phase: string;
  @Column({ type: 'varchar', default: 'mixte' }) producteur: 'agent' | 'mixte' | 'humain';
  /** Indispensable dans tout projet de développement, ou facultatif (peut être déclaré « sans objet »). */
  @Column({ type: 'varchar', default: 'facultatif' }) importance: 'indispensable' | 'facultatif';
  @Column({ default: false }) livrable: boolean;
  @Column({ default: false }) signature: boolean;
  @Column({ default: false }) recurrent: boolean;
  @Column('uuid', { nullable: true }) modele_id: string | null;
  @Column({ default: '' }) emplacement: string;
  @Column(md) description: string;
  @Column({ default: 0 }) ordre: number;
}

@Entity('phase_document')
@Unique(['organisation_id', 'code'])
export class PhaseDocument extends Base {
  @Column() code: string;
  @Column() titre: string;
  @Column({ default: 0 }) ordre: number;
}

@Entity('modele_document')
@Unique(['organisation_id', 'code'])
export class ModeleDocument extends Base {
  /** Nom du modèle (ex. « sfd.md », « session.md »). */
  @Column() code: string;
  @Column(md) contenu: string;
}

@Entity('document')
@Index(['projet_id', 'statut'])
export class Document extends BaseProjet {
  @Column('uuid', { nullable: true }) type_document_id: string | null;
  @Column() code: string;
  /** Titre et phase libres pour un document hors catalogue. */
  @Column(texte) titre: string | null;
  @Column(texte) phase: string | null;
  @Column({ type: 'varchar', default: 'a_produire' }) statut: string;
  @Column(date) echeance: string | null;
  @Column('uuid', { nullable: true }) responsable_id: string | null;
  @Column({ default: '' }) responsable: string;
  @Column({ default: '' }) version: string;
  @Column(date) date_validation: string | null;
  @Column({ default: '' }) lien_externe: string;
  /** Emplacement d'origine dans le kit v1. */
  @Column({ default: '' }) fichier: string;
  @Column(md) notes: string;
  @Column({ default: 0 }) ordre: number;
}

@Entity('version_document')
@Unique(['document_id', 'numero'])
export class VersionDocument extends Base {
  @Index() @Column('uuid') document_id: string;
  @Column() numero: string;
  @Column(md) contenu: string;
  @Column({ default: '' }) resume_modif: string;
  @Column({ type: 'varchar', default: 'humain' }) auteur_type: 'humain' | 'agent';
  @Column('uuid', { nullable: true }) auteur_id: string | null;
  @Column('uuid', { nullable: true }) session_id: string | null;
  /** Une version validée ou signée est figée. */
  @Column({ default: false }) figee: boolean;
}

@Entity('fichier')
export class Fichier extends BaseProjet {
  @Index() @Column('uuid', { nullable: true }) document_id: string | null;
  @Column() nom: string;
  @Column({ default: 'application/octet-stream' }) type_mime: string;
  @Column('bigint', { default: 0 }) taille: string;
  @Column() cle_stockage: string;
  @Column({ type: 'varchar' }) categorie: 'tdr' | 'scan_signe' | 'annexe' | 'export';
}
