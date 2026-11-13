import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsEmail, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class ConnexionDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(1) mot_de_passe: string;
}
export class RafraichirDto {
  @ApiProperty() @IsString() jeton_rafraichissement: string;
}
export class CreerJetonDto {
  @ApiProperty() @IsUUID() utilisateur_id: string;
  @ApiProperty() @IsString() nom: string;
  @ApiPropertyOptional({ type: [String], description: 'Projets autorisés (vide = tous ceux du titulaire)' }) @IsOptional() @IsArray() @IsUUID('all', { each: true }) projets?: string[];
  @ApiPropertyOptional({ enum: ['agent', 'admin', 'chef_projet', 'developpeur', 'client_lecteur'], default: 'agent' }) @IsOptional() @IsIn(['agent', 'admin', 'chef_projet', 'developpeur', 'client_lecteur']) role?: 'agent' | 'admin' | 'chef_projet' | 'developpeur' | 'client_lecteur';
  @ApiPropertyOptional() @IsOptional() @IsDateString() expire_le?: string;
}

export class UtilisateurSessionDto { id: string; email: string; nom: string; role: string; photo_url?: string | null; }
export class SessionAuthDto {
  jeton_acces: string;
  /** Durée de validité du jeton d'accès, en secondes. */
  expire_dans: number;
  jeton_rafraichissement: string;
  utilisateur: UtilisateurSessionDto;
}
export class ActeurDto {
  utilisateur_id: string; organisation_id: string; nom: string;
  role: 'admin' | 'chef_projet' | 'developpeur' | 'client_lecteur' | 'agent';
  auteur_type: 'humain' | 'agent';
  projets_jeton?: string[];
}
export class JetonApiDto {
  id: string; nom: string; prefixe: string; utilisateur_id: string; projets: string[];
  role: 'agent' | 'admin' | 'chef_projet' | 'developpeur' | 'client_lecteur';
  expire_le: Date | null; revoque_le: Date | null; utilise_le: Date | null; cree_le: Date;
}
export class JetonApiCreeDto extends JetonApiDto { jeton: string; avertissement: string; }

export class ConnexionGoogleDto {
  /** Jeton d'identité (ID token) renvoyé par Google Identity Services. */
  @ApiProperty() @IsString() @MinLength(20) credential: string;
}
export class MajProfilDto { @ApiProperty() @IsString() @MinLength(2) nom: string; }
export class OrganisationResumeDto { code: string; nom: string; }
export class ProfilDto {
  id: string; email: string; nom: string; role: string; photo_url: string | null;
  google_lie: boolean; mot_de_passe: boolean; derniere_connexion: Date | null; cree_le: Date;
  organisation: OrganisationResumeDto | null;
}
export class SessionConnexionDto {
  id: string; methode: 'mot_de_passe' | 'google'; appareil: string; ip: string;
  derniere_activite: Date; ouverte_le: Date; courante: boolean;
}
export class RevocationDto { revoquees: number; }
export class ConfigPubliqueDto { version_api: string; google_client_id: string | null; connexion_mot_de_passe: boolean; }
