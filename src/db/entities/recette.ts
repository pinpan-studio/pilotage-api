import { Column, Entity, Index, Unique } from 'typeorm';
import { Base, BaseProjet, date, md, texte } from './base';

@Entity('cas_test')
@Unique(['projet_id', 'ref'])
export class CasTest extends BaseProjet {
  @Column() ref: string;
  @Index() @Column('uuid', { nullable: true }) fonctionnalite_id: string | null;
  @Column() titre: string;
  @Column(md) preconditions: string;
  @Column('jsonb', { default: [] }) etapes: string[];
  @Column(md) attendu: string;
  @Column({ default: 0 }) ordre: number;
}

@Entity('campagne')
@Unique(['projet_id', 'ref'])
export class Campagne extends BaseProjet {
  @Column() ref: string;
  @Column({ default: '' }) titre: string;
  @Column(date) date: string | null;
  @Column({ type: 'varchar', default: 'interne' }) type: 'interne' | 'client';
  @Column({ default: '' }) environnement: string;
  @Column('text', { array: true, default: '{}' }) testeurs: string[];
}

@Entity('resultat_test')
@Unique(['campagne_id', 'cas_test_id'])
export class ResultatTest extends Base {
  @Index() @Column('uuid') campagne_id: string;
  @Index() @Column('uuid') cas_test_id: string;
  @Column({ type: 'varchar' }) resultat: 'ok' | 'ko' | 'reserve' | 'non_teste';
  @Column(md) commentaire: string;
}

@Entity('retour_client')
@Unique(['projet_id', 'ref'])
export class RetourClient extends BaseProjet {
  @Column() ref: string;
  @Column(date) date: string | null;
  @Column({ default: '' }) source: string;
  @Column({ default: '' }) contact_client: string;
  @Column({ default: '' }) saisi_par: string;
  @Column({ default: 'remarque' }) type: string;
  @Column({ default: 'moyenne' }) priorite: string;
  @Column({ default: 'nouveau' }) statut: string;
  @Column(date) date_resolution: string | null;
  @Column(md) retour: string;
  @Column(md) analyse: string;
  @Column(md) action: string;
  /** Corps Markdown complet (import kit v1). */
  @Column(md) contenu: string;
}

@Entity('retour_fonctionnalite')
export class RetourFonctionnalite {
  @Column('uuid', { primary: true }) retour_id: string;
  @Column('uuid', { primary: true }) fonctionnalite_id: string;
}
