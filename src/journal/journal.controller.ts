import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiAcceptedResponse, ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Acteur, ActeurCourant } from '../common/acteur';
import { AccesService } from '../common/acces.service';
import { EcritureService } from '../ecriture/ecriture.service';
import { IndicateursService } from '../indicateurs/indicateurs.service';
import { etatProjet } from '../mcp/etat';
import { BilanJournalDto, DemarrerSessionDto, EtatTexteDto, LotJournalDto, SessionDemarreeDto } from './journal.dto';
import { JournalService } from './journal.service';

@ApiTags('journal') @ApiBearerAuth()
@Controller()
export class JournalController {
  constructor(private readonly journal: JournalService, private readonly ecriture: EcritureService, private readonly acces: AccesService, private readonly ind: IndicateursService) {}

  /** Lot d'événements envoyé par les hooks Claude Code (idempotent). */
  @Post('journal') @HttpCode(202) @ApiAcceptedResponse({ type: BilanJournalDto })
  enregistrer(@ActeurCourant() a: Acteur, @Body() lot: LotJournalDto) { return this.journal.enregistrer(a, lot.evenements); }

  /** Équivalent REST de l'outil MCP demarrer_session (utilisé par le hook SessionStart). */
  @Post('sessions') @ApiCreatedResponse({ type: SessionDemarreeDto })
  async demarrer(@ActeurCourant() a: Acteur, @Body() dto: DemarrerSessionDto) {
    const { session } = await this.ecriture.demarrerSession(a, dto.projet, dto.depot, dto.session_externe);
    return { session_id: session.id };
  }

  /** Équivalent REST de l'outil MCP etat_projet (texte Markdown injecté en début de session). */
  @Get('projets/:code/etat') @ApiOkResponse({ type: EtatTexteDto }) @ApiQuery({ name: 'depot', required: false })
  async etat(@ActeurCourant() a: Acteur, @Param('code') code: string, @Query('depot') depot?: string) {
    const r = await etatProjet(a, { acces: this.acces, ind: this.ind }, code, depot);
    return { texte: r.texte, seuil_rappel_doc: r.seuil_rappel_doc, genere_le: new Date().toISOString() };
  }
}
