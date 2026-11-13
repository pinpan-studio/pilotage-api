import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from './common/acteur';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

export class SanteDto { statut: string; version_api: string; heure: string; }

export const VERSION_API = 'v1';

@ApiTags('santé')
@Controller('sante')
export class SanteController {
  constructor(private readonly db: DataSource) {}
  @Public() @Get() @ApiOkResponse({ type: SanteDto })
  async sante() {
    await this.db.query('SELECT 1');
    return { statut: 'ok', version_api: VERSION_API, heure: new Date().toISOString() };
  }
}
