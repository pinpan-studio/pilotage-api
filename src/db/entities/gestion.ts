import { Column, Entity, Unique } from 'typeorm';
import { BaseProjet, date, md } from './base';

@Entity('jalon')
@Unique(['projet_id', 'ref'])
export class Jalon extends BaseProjet {
  @Column() ref: string;
  @Column() nom: string;
  @Column(date) date_prevue: string | null;
  @Column(date) date_reelle: string | null;
  @Column({ default: '' }) lot: string;
  @Column({ default: '' }) facturation: string;
  @Column({ default: 0 }) ordre: number;
}

/** Documents attendus à un jalon (codes du catalogue). */
@Entity('jalon_document')
export class JalonDocument {
  @Column('uuid', { primary: true }) jalon_id: string;
  @Column({ primary: true }) code_document: string;
  @Column({ default: 0 }) ordre: number;
}

@Entity('risque')
@Unique(['projet_id', 'ref'])
export class Risque extends BaseProjet {
  @Column() ref: string;
  @Column() titre: string;
  @Column({ default: '' }) categorie: string;
  @Column({ default: 1 }) probabilite: number;
  @Column({ default: 1 }) impact: number;
  @Column(md) parade: string;
  @Column({ default: '' }) responsable: string;
  @Column(date) date: string | null;
  @Column({ type: 'varchar', default: 'ouvert' }) statut: 'ouvert' | 'surveille' | 'survenu' | 'clos';
}

@Entity('action')
@Unique(['projet_id', 'ref'])
export class Action extends BaseProjet {
  @Column() ref: string;
  @Column('text') action: string;
  @Column({ default: '' }) responsable: string;
  @Column(date) echeance: string | null;
  @Column({ type: 'varchar', default: 'a_faire' }) statut: 'a_faire' | 'en_cours' | 'fait' | 'annule';
  @Column({ default: '' }) origine_type: string;
  @Column({ default: '' }) origine_id: string;
}

@Entity('changement')
@Unique(['projet_id', 'ref'])
export class Changement extends BaseProjet {
  @Column() ref: string;
  @Column() titre: string;
  @Column({ default: '' }) demandeur: string;
  @Column(date) date: string | null;
  @Column(md) description: string;
  @Column({ default: '' }) origine: string;
  @Column({ default: 0 }) impact_delai_jours: number;
  @Column({ default: '' }) impact_cout: string;
  @Column({ type: 'varchar', default: 'en_analyse' }) decision: 'en_analyse' | 'accepte' | 'refuse' | 'reporte';
  @Column(date) date_decision: string | null;
  @Column({ default: '' }) avenant: string;
}

@Entity('changement_fonctionnalite')
export class ChangementFonctionnalite {
  @Column('uuid', { primary: true }) changement_id: string;
  @Column('uuid', { primary: true }) fonctionnalite_id: string;
}

@Entity('reunion')
export class Reunion extends BaseProjet {
  @Column(date) date: string | null;
  @Column({ default: 'autre' }) type: string;
  @Column({ default: '' }) titre: string;
  @Column({ default: '' }) lieu: string;
  @Column('jsonb', { default: [] }) participants: string[];
  @Column({ default: '' }) redacteur: string;
  @Column(md) contenu: string;
}

@Entity('partie_prenante')
export class PartiePrenante extends BaseProjet {
  @Column() nom: string;
  @Column({ default: '' }) fonction: string;
  @Column({ default: '' }) organisme: string;
  @Column({ default: '' }) role: string;
  @Column({ default: '' }) influence: string;
  @Column(md) attentes: string;
}
