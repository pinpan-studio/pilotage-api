import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ActeurDto, ConfigPubliqueDto, ConnexionDto, ConnexionGoogleDto, CreerJetonDto, JetonApiCreeDto, JetonApiDto, MajProfilDto, ProfilDto, RafraichirDto, RevocationDto, SessionAuthDto, SessionConnexionDto } from './auth.dto';
import { VERSION_API } from '../sante.controller';

const ctx = (req: Request) => ({ appareil: String(req.headers['user-agent'] ?? ''), ip: req.ip ?? '' });
import { Acteur, ActeurCourant, Public, Roles } from '../common/acteur';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public() @Post('connexion') @HttpCode(200) @ApiOkResponse({ type: SessionAuthDto })
  connexion(@Body() dto: ConnexionDto, @Req() req: Request) { return this.auth.connexion(dto.email, dto.mot_de_passe, ctx(req)); }

  @Public() @Post('google') @HttpCode(200) @ApiOkResponse({ type: SessionAuthDto })
  google(@Body() dto: ConnexionGoogleDto, @Req() req: Request) { return this.auth.connexionGoogle(dto.credential, ctx(req)); }

  /** Pas de domaine commun entre l'API et l'interface : le jeton de rafraîchissement circule dans le corps. */
  @Public() @Post('rafraichir') @HttpCode(200) @ApiOkResponse({ type: SessionAuthDto })
  rafraichir(@Body() dto: RafraichirDto, @Req() req: Request) { return this.auth.rafraichir(dto.jeton_rafraichissement, ctx(req)); }

  @Public() @Post('deconnexion') @HttpCode(204)
  async deconnexion(@Body() dto: RafraichirDto) { await this.auth.deconnexion(dto.jeton_rafraichissement); }

  @ApiBearerAuth() @Get('moi') @ApiOkResponse({ type: ActeurDto })
  moi(@ActeurCourant() a: Acteur) { return a; }
}

@ApiTags('administration') @ApiBearerAuth()
@Controller('jetons')
@Roles('admin')
export class JetonsController {
  constructor(private readonly auth: AuthService) {}
  @Get() @ApiOkResponse({ type: [JetonApiDto] }) lister(@ActeurCourant() a: Acteur) { return this.auth.listerJetons(a); }
  @Post() @ApiCreatedResponse({ type: JetonApiCreeDto }) creer(@ActeurCourant() a: Acteur, @Body() dto: CreerJetonDto) { return this.auth.creerJetonApi(a, dto); }
  @Delete(':id') @HttpCode(204)
  async revoquer(@ActeurCourant() a: Acteur, @Param('id', ParseUUIDPipe) id: string) { await this.auth.revoquerJeton(a, id); }
}

@ApiTags('compte') @ApiBearerAuth()
@Controller('compte')
export class CompteController {
  constructor(private readonly auth: AuthService) {}
  @Get() @ApiOkResponse({ type: ProfilDto }) profil(@ActeurCourant() a: Acteur) { return this.auth.profil(a); }
  @Patch() @ApiOkResponse({ type: ProfilDto }) majProfil(@ActeurCourant() a: Acteur, @Body() dto: MajProfilDto) { return this.auth.majProfil(a, dto.nom); }
  @Get('sessions') @ApiOkResponse({ type: [SessionConnexionDto] }) sessions(@ActeurCourant() a: Acteur) { return this.auth.sessions(a); }
  @Delete('sessions/:id') @HttpCode(204)
  async revoquer(@ActeurCourant() a: Acteur, @Param('id', ParseUUIDPipe) id: string) { await this.auth.revoquerSession(a, id); }
  @Post('sessions/revoquer-autres') @HttpCode(200) @ApiOkResponse({ type: RevocationDto })
  revoquerAutres(@ActeurCourant() a: Acteur) { return this.auth.revoquerAutresSessions(a); }
}

/** Configuration publique lue par l'interface au démarrage (aucun secret). */
@ApiTags('santé')
@Controller('config')
export class ConfigController {
  @Public() @Get() @ApiOkResponse({ type: ConfigPubliqueDto })
  config(): ConfigPubliqueDto {
    return { version_api: VERSION_API, google_client_id: process.env.GOOGLE_CLIENT_ID || null, connexion_mot_de_passe: process.env.CONNEXION_MOT_DE_PASSE !== '0' };
  }
}
