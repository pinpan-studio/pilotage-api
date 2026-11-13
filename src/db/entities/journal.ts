import { Column, Entity, Generated, Index } from 'typeorm';
import { BaseProjet, md } from './base';

@Entity('session_dev')
@Index(['projet_id', 'debut'])
export class SessionDev extends BaseProjet {
  @Column('uuid', { nullable: true }) depot_id: string | null;
  @Column('uuid', { nullable: true }) utilisateur_id: string | null;
  @Column({ default: '' }) auteur: string;
  @Column({ type: 'timestamptz' }) debut: Date;
  @Column({ type: 'timestamptz', nullable: true }) fin: Date | null;
  @Column(md) resume: string;
  @Column('jsonb', { default: [] }) notes: { ts: string; texte: string; fonctionnalites: string[] }[];
  @Column('text', { array: true, default: '{}' }) fonctionnalites: string[];
  /** Identifiant de session côté Claude Code. */
  @Column({ default: '' }) session_externe: string;
}

@Entity('evenement_journal')
@Index(['projet_id', 'ts'])
export class EvenementJournal extends BaseProjet {
  @Column('uuid', { nullable: true }) depot_id: string | null;
  @Column('uuid', { nullable: true }) utilisateur_id: string | null;
  @Column({ default: '' }) auteur: string;
  @Column({ default: '' }) session_externe: string;
  @Column({ type: 'timestamptz' }) ts: Date;
  @Column({ type: 'varchar' }) evt: string;
  @Column({ default: '' }) outil: string;
  @Column({ default: '' }) fichier: string;
  @Column(md) commande: string;
  @Column({ default: '' }) hash: string;
  @Column(md) message: string;
  @Column('text', { array: true, default: '{}' }) fonctionnalites: string[];
  @Index({ unique: true }) @Column('uuid') cle_idempotence: string;
  /** Ordre d'arrivée (départage les événements de même horodatage). */
  @Column('bigint') @Generated('increment') seq: string;
}
