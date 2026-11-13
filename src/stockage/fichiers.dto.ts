import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { CATEGORIES } from './fichiers.service';
import { STATUTS_DOCUMENT } from '../indicateurs/referentiels';

export class DeposerFichierDto {
  @ApiProperty({ type: 'string', format: 'binary' }) fichier: any;
  @ApiProperty({ enum: CATEGORIES }) @IsIn(CATEGORIES as unknown as string[]) categorie: string;
  @ApiPropertyOptional({ description: 'Code du document rattaché (obligatoire pour un scan signé)' }) @IsOptional() @IsString() document?: string;
}

export class StatutDocumentDto {
  @ApiProperty({ enum: STATUTS_DOCUMENT }) @IsIn(STATUTS_DOCUMENT) statut: string;
}
export class StatutDocumentResultatDto { code: string; titre: string | null; statut: string; }
