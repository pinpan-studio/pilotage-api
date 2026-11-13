import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Acteur, ActeurCourant } from '../common/acteur';
import { GenerationService } from './generation.service';

export class GenererDto { @ApiPropertyOptional({ enum: ['en_cours', 'en_revue'] }) @IsOptional() @IsIn(['en_cours', 'en_revue']) statut?: 'en_cours' | 'en_revue'; }
export class ApercuGenerationDto { code: string; contenu_md: string; }
export class GenerationDto { code: string; version: string; statut: string; contenu_md: string; }
export class GenerablesDto { codes: string[]; }

/** Génération des livrables à partir des données du projet. */
@ApiTags('livrables') @ApiBearerAuth()
@Controller()
export class GenerationController {
  constructor(private readonly g: GenerationService) {}
  @Get('documents-generables') @ApiOkResponse({ type: GenerablesDto })
  generables() { return { codes: GenerationService.CODES_GENERABLES }; }
  @Get('projets/:code/documents/:doc/apercu-generation') @ApiOkResponse({ type: ApercuGenerationDto })
  apercu(@ActeurCourant() a: Acteur, @Param('code') c: string, @Param('doc') d: string) { return this.g.apercu(a, c, d); }
  @Post('projets/:code/documents/:doc/generer') @ApiCreatedResponse({ type: GenerationDto })
  generer(@ActeurCourant() a: Acteur, @Param('code') c: string, @Param('doc') d: string, @Body() b: GenererDto) { return this.g.generer(a, c, d, b); }
}
