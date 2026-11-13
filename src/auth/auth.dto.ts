import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsDateString, IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

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
  @ApiProperty({ type: [String], description: 'Identifiants des projets autorisés' }) @IsArray() @ArrayNotEmpty() @IsUUID('all', { each: true }) projets: string[];
  @ApiPropertyOptional() @IsOptional() @IsDateString() expire_le?: string;
}

export class UtilisateurSessionDto { id: string; email: string; nom: string; role: string; }
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
  expire_le: Date | null; revoque_le: Date | null; utilise_le: Date | null; cree_le: Date;
}
export class JetonApiCreeDto extends JetonApiDto { jeton: string; avertissement: string; }
