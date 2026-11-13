import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';

export const ROLES_EQUIPE = ['admin', 'chef_projet', 'developpeur', 'client_lecteur'] as const;
export const ROLES_PROJET = ['chef_projet', 'developpeur', 'client_lecteur'] as const;

export class EquipeDto { id: string; code: string; nom: string; role: string; courante: boolean; nb_membres: number; nb_projets: number; }
export class CreerEquipeDto { @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) nom: string; }
export class MajEquipeDto { @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) nom: string; }
export class ChangerEquipeDto { @ApiProperty() @IsUUID() organisation_id: string; }

export class MembreEquipeDto {
  id: string; email: string; nom: string; role: string; actif: boolean; photo_url: string | null;
  derniere_connexion: Date | null; invite: boolean; nb_projets: number; moi: boolean;
}
export class InviterDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) nom?: string;
  @ApiProperty({ enum: ROLES_EQUIPE }) @IsIn(ROLES_EQUIPE as unknown as string[]) role: string;
}
export class InvitationDto { membre: MembreEquipeDto; lien: string; message: string; }
export class MajMembreDto {
  @ApiPropertyOptional({ enum: ROLES_EQUIPE }) @IsOptional() @IsIn(ROLES_EQUIPE as unknown as string[]) role?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() actif?: boolean;
}

export class DepotACreerDto {
  @ApiProperty() @IsString() @Matches(/^[a-z0-9][a-z0-9-]{0,40}$/, { message: 'nom de dépôt : minuscules, chiffres et tirets' }) nom: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) url?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) stack?: string;
}
export class CreerProjetDto {
  @ApiProperty({ description: 'Identifiant court : minuscules, chiffres, tirets' }) @IsString() @Matches(/^[a-z0-9][a-z0-9-]{1,60}$/, { message: 'code : minuscules, chiffres et tirets (2 à 61 caractères)' }) code: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(200) nom: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) client?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() date_debut?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() date_livraison_prevue?: string;
  @ApiPropertyOptional({ enum: ['equipe', 'equipe_lecture', 'membres'], default: 'equipe' }) @IsOptional() @IsIn(['equipe', 'equipe_lecture', 'membres']) visibilite?: 'equipe' | 'equipe_lecture' | 'membres';
  @ApiPropertyOptional({ type: [DepotACreerDto] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => DepotACreerDto) depots?: DepotACreerDto[];
}
export class ProjetCreeDto { id: string; code: string; nom: string; nb_documents: number; }

export class MembreProjetDto { utilisateur_id: string; email: string; nom: string; photo_url: string | null; role_equipe: string; role: string; actif: boolean; }
export class DefinirMembreProjetDto {
  @ApiProperty() @IsUUID() utilisateur_id: string;
  @ApiProperty({ enum: ROLES_PROJET }) @IsIn(ROLES_PROJET as unknown as string[]) role: string;
}

export class VisibiliteDto { @ApiProperty({ enum: ['equipe', 'equipe_lecture', 'membres'], description: 'equipe : toute l’équipe voit et contribue ; equipe_lecture : toute l’équipe voit, seuls les membres modifient ; membres : privé' }) @IsIn(['equipe', 'equipe_lecture', 'membres']) visibilite: 'equipe' | 'equipe_lecture' | 'membres'; }
export class VisibiliteResultatDto { code: string; visibilite: string; }
