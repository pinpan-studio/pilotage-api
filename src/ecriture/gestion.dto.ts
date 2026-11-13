import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';

const PRIO = ['haute', 'moyenne', 'basse']; const TYPES_RETOUR = ['bug', 'evolution', 'question', 'remarque'];
const opt = () => ApiPropertyOptional();

export class CreerFonctionnaliteDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(300) titre: string;
  @opt() @IsOptional() @IsString() lot?: string;
  @ApiPropertyOptional({ enum: [1, 2, 3, 5, 8] }) @IsOptional() @IsInt() poids?: number;
  @opt() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) depots?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) exigences?: string[];
  @ApiPropertyOptional({ description: 'interne, TDR ou DC-xxx' }) @IsOptional() @IsString() origine?: string;
}
export class ModifierFonctionnaliteDto {
  @opt() @IsOptional() @IsString() @MinLength(2) titre?: string;
  @opt() @IsOptional() @IsString() lot?: string;
  @ApiPropertyOptional({ enum: [1, 2, 3, 5, 8] }) @IsOptional() @IsInt() poids?: number;
  @opt() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) depots?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) exigences?: string[];
}
export class ExigenceDto {
  @ApiProperty() @IsString() @MinLength(2) titre: string;
  @ApiPropertyOptional({ enum: ['must', 'should', 'could'] }) @IsOptional() @IsIn(['must', 'should', 'could']) priorite?: string;
  @opt() @IsOptional() @IsString() section_tdr?: string;
  @opt() @IsOptional() @IsString() description?: string;
}
export class ModifierExigenceDto {
  @opt() @IsOptional() @IsString() @MinLength(2) titre?: string;
  @ApiPropertyOptional({ enum: ['must', 'should', 'could'] }) @IsOptional() @IsIn(['must', 'should', 'could']) priorite?: string;
  @opt() @IsOptional() @IsString() section_tdr?: string;
  @opt() @IsOptional() @IsString() description?: string;
}
export class JalonDto {
  @ApiProperty() @IsString() @MinLength(2) nom: string;
  @opt() @IsOptional() @IsDateString() date_prevue?: string;
  @opt() @IsOptional() @IsString() lot?: string;
  @opt() @IsOptional() @IsString() facturation?: string;
  @ApiPropertyOptional({ type: [String], description: 'Codes des documents attendus' }) @IsOptional() @IsArray() @IsString({ each: true }) documents?: string[];
}
export class ModifierJalonDto {
  @opt() @IsOptional() @IsString() nom?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() date_prevue?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() date_reelle?: string | null;
  @opt() @IsOptional() @IsString() lot?: string;
  @opt() @IsOptional() @IsString() facturation?: string;
}
export class RisqueDto {
  @ApiProperty() @IsString() @MinLength(2) titre: string;
  @ApiProperty() @IsInt() @Min(1) @Max(4) probabilite: number;
  @ApiProperty() @IsInt() @Min(1) @Max(4) impact: number;
  @opt() @IsOptional() @IsString() categorie?: string;
  @opt() @IsOptional() @IsString() parade?: string;
  @opt() @IsOptional() @IsString() responsable?: string;
}
export class ModifierRisqueDto {
  @opt() @IsOptional() @IsString() titre?: string;
  @ApiPropertyOptional({ enum: ['ouvert', 'surveille', 'survenu', 'clos'] }) @IsOptional() @IsIn(['ouvert', 'surveille', 'survenu', 'clos']) statut?: string;
  @opt() @IsOptional() @IsInt() @Min(1) @Max(4) probabilite?: number;
  @opt() @IsOptional() @IsInt() @Min(1) @Max(4) impact?: number;
  @opt() @IsOptional() @IsString() categorie?: string;
  @opt() @IsOptional() @IsString() parade?: string;
  @opt() @IsOptional() @IsString() responsable?: string;
}
export class RetourDto {
  @ApiProperty() @IsString() @MinLength(2) retour_md: string;
  @ApiPropertyOptional({ enum: TYPES_RETOUR }) @IsOptional() @IsIn(TYPES_RETOUR) type?: string;
  @ApiPropertyOptional({ enum: PRIO }) @IsOptional() @IsIn(PRIO) priorite?: string;
  @opt() @IsOptional() @IsString() source?: string;
  @opt() @IsOptional() @IsString() contact_client?: string;
  @opt() @IsOptional() @IsDateString() date?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) fonctionnalites?: string[];
}
export class ModifierRetourDto {
  @ApiPropertyOptional({ enum: ['nouveau', 'en_cours', 'resolu', 'rejete'] }) @IsOptional() @IsIn(['nouveau', 'en_cours', 'resolu', 'rejete']) statut?: string;
  @ApiPropertyOptional({ enum: TYPES_RETOUR }) @IsOptional() @IsIn(TYPES_RETOUR) type?: string;
  @ApiPropertyOptional({ enum: PRIO }) @IsOptional() @IsIn(PRIO) priorite?: string;
  @opt() @IsOptional() @IsString() analyse?: string;
  @opt() @IsOptional() @IsString() action?: string;
}
export class ChangementDto {
  @ApiProperty() @IsString() @MinLength(2) titre: string;
  @opt() @IsOptional() @IsString() description?: string;
  @opt() @IsOptional() @IsString() demandeur?: string;
  @opt() @IsOptional() @IsInt() impact_delai_jours?: number;
  @opt() @IsOptional() @IsString() impact_cout?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) fonctionnalites?: string[];
}
export class DecisionChangementDto {
  @ApiProperty({ enum: ['en_analyse', 'accepte', 'refuse', 'reporte'] }) @IsIn(['en_analyse', 'accepte', 'refuse', 'reporte']) decision: string;
  @opt() @IsOptional() @IsString() avenant?: string;
  @opt() @IsOptional() @IsInt() impact_delai_jours?: number;
  @opt() @IsOptional() @IsString() impact_cout?: string;
}
export class CasTestDto {
  @ApiProperty() @IsString() @MinLength(2) titre: string;
  @ApiPropertyOptional({ description: 'F-xxx' }) @IsOptional() @IsString() fonctionnalite?: string;
  @opt() @IsOptional() @IsString() preconditions?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) etapes?: string[];
  @opt() @IsOptional() @IsString() attendu?: string;
}
export class ResultatDto {
  @ApiProperty() @IsString() cas_test: string;
  @ApiProperty({ enum: ['ok', 'ko', 'reserve', 'non_teste'] }) @IsIn(['ok', 'ko', 'reserve', 'non_teste']) resultat: 'ok' | 'ko' | 'reserve' | 'non_teste';
  @opt() @IsOptional() @IsString() commentaire?: string;
}
export class ResultatsCampagneDto {
  @opt() @IsOptional() @IsString() titre?: string;
  @ApiPropertyOptional({ enum: ['interne', 'client'] }) @IsOptional() @IsIn(['interne', 'client']) type?: 'interne' | 'client';
  @opt() @IsOptional() @IsDateString() date?: string;
  @opt() @IsOptional() @IsString() environnement?: string;
  @ApiProperty({ type: [ResultatDto] }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ResultatDto) resultats: ResultatDto[];
}
class ActionCrDto { @ApiProperty() @IsString() action: string; @opt() @IsOptional() @IsString() responsable?: string; @opt() @IsOptional() @IsDateString() echeance?: string; }
export class CompteRenduDto {
  @ApiProperty() @IsDateString() date: string;
  @opt() @IsOptional() @IsString() type?: string;
  @opt() @IsOptional() @IsString() titre?: string;
  @opt() @IsOptional() @IsString() lieu?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) participants?: string[];
  @ApiProperty() @IsString() @MinLength(1) contenu_md: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) decisions?: string[];
  @ApiPropertyOptional({ type: [ActionCrDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ActionCrDto) actions?: ActionCrDto[];
  @ApiPropertyOptional({ type: [RisqueDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RisqueDto) risques?: RisqueDto[];
  @ApiPropertyOptional({ type: [ChangementDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ChangementDto) changements?: ChangementDto[];
}
export class ContenuDocumentDto {
  @ApiProperty() @IsString() contenu_md: string;
  @ApiProperty() @IsString() @MinLength(2) resume_modif: string;
  @ApiPropertyOptional({ enum: ['en_cours', 'en_revue'] }) @IsOptional() @IsIn(['en_cours', 'en_revue']) statut?: string;
}
export class RefDto { ref: string; }
export class BilanCampagneDto { campagne: string; bilan: Record<string, number>; }
export class CompteRenduCreeDto { reunion_id: string; date: string; actions: string[]; risques: string[]; changements: string[]; }
