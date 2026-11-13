import { Column, CreateDateColumn, DeleteDateColumn, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Colonnes communes à toutes les tables (§5) : identifiant, organisation, horodatage, suppression logique. */
export abstract class Base {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') organisation_id: string;
  @CreateDateColumn({ type: 'timestamptz' }) cree_le: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) modifie_le: Date;
  @Column('uuid', { nullable: true }) cree_par: string | null;
  @DeleteDateColumn({ type: 'timestamptz' }) supprime_le: Date | null;
}

/** Table rattachée à un projet. */
export abstract class BaseProjet extends Base {
  @Index() @Column('uuid') projet_id: string;
}

export const date = { type: 'date' as const, nullable: true };
export const texte = { type: 'text' as const, nullable: true };
export const md = { type: 'text' as const, default: '' };
