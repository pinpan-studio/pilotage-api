import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

export const TYPES_EVENEMENT = ['modification', 'creation', 'commande', 'commit', 'doc', 'agent'] as const;

export class EvenementJournalDto {
  /** uuid généré sur le poste : un renvoi après coupure ne crée pas de doublon. */
  @ApiProperty() @IsUUID() cle_idempotence: string;
  @ApiProperty() @IsString() @MaxLength(100) projet: string;
  @ApiProperty() @IsString() @MaxLength(100) depot: string;
  @ApiProperty() @IsDateString() ts: string;
  @ApiProperty({ enum: TYPES_EVENEMENT }) @IsIn(TYPES_EVENEMENT as unknown as string[]) evt: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) outil?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) fichier?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) commande?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) hash?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) message?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) fonctionnalites?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) session_externe?: string;
  @ApiPropertyOptional({ description: 'Nom de git user.name sur le poste' }) @IsOptional() @IsString() @MaxLength(200) auteur?: string;
}

export class LotJournalDto {
  @ApiProperty({ type: [EvenementJournalDto] }) @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => EvenementJournalDto)
  evenements: EvenementJournalDto[];
}

export class RejetDto { cle_idempotence: string; raison: string; }
export class BilanJournalDto {
  recus: number;
  enregistres: number;
  /** Déjà reçus lors d'un envoi précédent (ignorés). */
  doublons: number;
  rejetes: RejetDto[];
}

export class DemarrerSessionDto {
  @ApiProperty() @IsString() projet: string;
  @ApiPropertyOptional() @IsOptional() @IsString() depot?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) session_externe?: string;
}
export class SessionDemarreeDto { session_id: string; }
export class EtatTexteDto { texte: string; seuil_rappel_doc: number; genere_le: string; }
