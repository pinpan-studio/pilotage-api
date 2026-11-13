import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { STATUTS_ACTION, STATUTS_DEPOT, STATUTS_FONCTIONNALITE } from '../indicateurs/referentiels';

export class CreerTacheDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(500) action: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) responsable?: string;
  @ApiPropertyOptional({ description: 'AAAA-MM-JJ' }) @IsOptional() @IsDateString() echeance?: string;
}
export class ModifierTacheDto {
  @ApiPropertyOptional({ enum: STATUTS_ACTION }) @IsOptional() @IsIn(STATUTS_ACTION) statut?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) action?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) responsable?: string;
  @ApiPropertyOptional({ nullable: true, description: 'AAAA-MM-JJ ou null pour retirer l’échéance' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() echeance?: string | null;
}
export class StatutFonctionnaliteDto {
  @ApiProperty({ description: `Global : ${STATUTS_FONCTIONNALITE.join(', ')} ; par dépôt : ${STATUTS_DEPOT.join(', ')}` }) @IsString() statut: string;
  @ApiPropertyOptional({ description: 'Nom du dépôt (statut par dépôt)' }) @IsOptional() @IsString() depot?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class StatutFonctionnaliteResultatDto { ref: string; statut: string; depot?: string; }
