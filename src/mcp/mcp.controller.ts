import { All, Controller, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Acteur } from '../common/acteur';
import { AccesService } from '../common/acces.service';
import { EcritureService } from '../ecriture/ecriture.service';
import { IndicateursService } from '../indicateurs/indicateurs.service';
import { LectureService } from '../lecture/lecture.service';
import { creerServeurMcp } from './serveur-mcp';

/**
 * Serveur MCP (transport Streamable HTTP, mode sans état : un serveur par requête, adapté
 * à une connexion instable et à plusieurs instances). Authentification : Bearer <jeton d'API>.
 */
@ApiExcludeController()
@Controller('mcp')
export class McpController {
  constructor(private readonly lecture: LectureService, private readonly ecriture: EcritureService, private readonly ind: IndicateursService, private readonly acces: AccesService) {}

  @All()
  async gerer(@Req() req: Request & { acteur: Acteur }, @Res() res: Response) {
    if (req.method !== 'POST') {
      res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Méthode non autorisée : ce serveur MCP fonctionne sans état (POST uniquement).' }, id: null });
      return;
    }
    if (!req.acteur) throw new UnauthorizedException('Authentification requise.');
    const serveur = creerServeurMcp(req.acteur, { lecture: this.lecture, ecriture: this.ecriture, ind: this.ind, acces: this.acces });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); serveur.close(); });
    await serveur.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }
}
