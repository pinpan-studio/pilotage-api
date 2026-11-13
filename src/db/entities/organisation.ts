import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Base, texte } from './base';

@Entity('organisation')
export class Organisation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) code: string;
  @Column() nom: string;
  @CreateDateColumn({ type: 'timestamptz' }) cree_le: Date;
}

export type RoleUtilisateur = 'admin' | 'chef_projet' | 'developpeur' | 'client_lecteur';

@Entity('utilisateur')
@Unique(['organisation_id', 'email'])
export class Utilisateur extends Base {
  @Column() email: string;
  @Column() nom: string;
  @Column(texte) mot_de_passe_hache: string | null;
  @Column({ type: 'varchar', default: 'developpeur' }) role: RoleUtilisateur;
  @Column({ default: true }) actif: boolean;
  /** Identifiant Google (« sub ») lié au compte, après la première connexion Google. */
  /** Une même personne peut appartenir à plusieurs équipes (une ligne par équipe, même sub). */
  @Index() @Column({ type: 'varchar', nullable: true }) google_sub: string | null;
  @Column({ type: 'varchar', nullable: true }) photo_url: string | null;
  @Column({ type: 'timestamptz', nullable: true }) derniere_connexion: Date | null;
}

@Entity('jeton_api')
export class JetonApi extends Base {
  @Index() @Column('uuid') utilisateur_id: string;
  @Column() nom: string;
  /** Début visible du jeton (ex. « plt_ab12cd34 »). */
  @Index({ unique: true }) @Column() prefixe: string;
  @Column() hache: string;
  /** Projets autorisés (ids). */
  @Column('uuid', { array: true, default: '{}' }) projets: string[];
  @Column({ type: 'timestamptz', nullable: true }) expire_le: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) revoque_le: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) utilise_le: Date | null;
}

@Entity('jeton_rafraichissement')
export class JetonRafraichissement {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') utilisateur_id: string;
  @Index({ unique: true }) @Column() hache: string;
  @Column({ type: 'timestamptz' }) expire_le: Date;
  @Column({ type: 'timestamptz', nullable: true }) revoque_le: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) cree_le: Date;
  /** Session d'origine (stable à travers les rotations du jeton). */
  @Index() @Column('uuid', { nullable: true }) session_id: string | null;
  @Column({ type: 'varchar', default: 'mot_de_passe' }) methode: 'mot_de_passe' | 'google';
  @Column({ type: 'varchar', default: '' }) appareil: string;
  @Column({ type: 'varchar', default: '' }) ip: string;
  @Column({ type: 'timestamptz', nullable: true }) utilise_le: Date | null;
}

@Entity('historique')
@Index(['entite', 'entite_id'])
export class Historique {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') organisation_id: string;
  @Column('uuid', { nullable: true }) projet_id: string | null;
  @Column() entite: string;
  @Column('uuid') entite_id: string;
  @Column() champ: string;
  @Column('jsonb', { nullable: true }) ancienne_valeur: unknown;
  @Column('jsonb', { nullable: true }) nouvelle_valeur: unknown;
  @Column({ type: 'varchar', default: 'humain' }) auteur_type: 'humain' | 'agent';
  @Column('uuid', { nullable: true }) auteur_id: string | null;
  @Column('uuid', { nullable: true }) session_id: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) ts: Date;
}
