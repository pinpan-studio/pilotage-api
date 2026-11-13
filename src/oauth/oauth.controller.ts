import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { IsArray, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { Acteur, ActeurCourant, Public } from '../common/acteur';
import { ErreurOAuth, OAuthService } from './oauth.service';

/** URL publique de l'API (derrière le proxy Vercel). */
export const baseApi = (req: Request) => (process.env.API_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const origineWeb = () => (process.env.WEB_ORIGIN ?? 'http://localhost:4200').split(',')[0].replace(/\/$/, '');

/** Points d'entrée OAuth « standards » (hors préfixe /api/v1) consommés par les assistants. */
@ApiExcludeController() @Public()
@Controller()
export class OAuthPublicController {
  constructor(private readonly o: OAuthService) {}

  @Get(['.well-known/oauth-protected-resource', '.well-known/oauth-protected-resource/mcp'])
  ressource(@Req() req: Request) {
    const b = baseApi(req);
    return { resource: `${b}/mcp`, authorization_servers: [b], bearer_methods_supported: ['header'], resource_name: 'Pilotage (MCP)', resource_documentation: `${origineWeb()}/parametres/claude-code` };
  }

  @Get(['.well-known/oauth-authorization-server', '.well-known/openid-configuration'])
  serveur(@Req() req: Request) {
    const b = baseApi(req);
    return { issuer: b, authorization_endpoint: `${b}/oauth/authorize`, token_endpoint: `${b}/oauth/token`, registration_endpoint: `${b}/oauth/register`,
      response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'], scopes_supported: ['agent', 'client_lecteur', 'developpeur', 'chef_projet', 'admin'] };
  }

  @Post('oauth/register') @HttpCode(201)
  enregistrer(@Body() b: any) { return this.o.enregistrer(b ?? {}); }

  /** Redirige vers la page de consentement de l'application web (l'utilisateur s'y connecte s'il ne l'est pas). */
  @Get('oauth/authorize')
  async autoriser(@Query() q: Record<string, string>, @Res() res: Response) {
    try {
      if (q.response_type !== 'code') throw new ErreurOAuth('unsupported_response_type', 'response_type=code attendu.');
      await this.o.verifierDemande(q.client_id, q.redirect_uri, q.code_challenge ?? '', q.code_challenge_method);
    } catch (e: any) { res.status(400).type('text/plain; charset=utf-8').send(`Demande d'autorisation invalide : ${e.response?.error_description ?? e.message}`); return; }
    const p = new URLSearchParams(); for (const k of ['client_id', 'redirect_uri', 'state', 'code_challenge', 'scope']) if (q[k]) p.set(k, q[k]);
    res.redirect(302, `${origineWeb()}/autoriser?${p.toString()}`);
  }

  @Post('oauth/token') @HttpCode(200)
  async jeton(@Body() b: Record<string, string>, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    try { res.json(await this.o.jeton(b ?? {})); }
    catch (e: any) { res.status(400).json(e.response?.error ? e.response : { error: 'invalid_request', error_description: e.message }); }
  }
}

export class ApprobationDto {
  @IsUUID() client_id: string;
  @IsString() redirect_uri: string;
  @IsString() code_challenge: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsIn(['agent', 'client_lecteur', 'developpeur', 'chef_projet', 'admin']) role?: string;
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) projets?: string[];
}
export class ClientOAuthDto { client_id: string; nom: string; redirect_uris: string[]; }
export class RedirectionDto { redirection: string; }

/** Consentement (application web, utilisateur connecté). */
@ApiTags('oauth') @ApiBearerAuth()
@Controller('oauth')
export class OAuthConsentementController {
  constructor(private readonly o: OAuthService) {}
  @Get('clients/:id') @ApiOkResponse({ type: ClientOAuthDto })
  client(@Param('id') id: string) { return this.o.client(id); }
  @Post('approuver') @HttpCode(200) @ApiOkResponse({ type: RedirectionDto })
  approuver(@ActeurCourant() a: Acteur, @Body() d: ApprobationDto) { return this.o.approuver(a, d); }
  @Post('refuser') @HttpCode(200) @ApiOkResponse({ type: RedirectionDto })
  async refuser(@Body() d: ApprobationDto) { await this.o.verifierDemande(d.client_id, d.redirect_uri); return { redirection: this.o.refusUrl(d.redirect_uri, d.state) }; }
}
