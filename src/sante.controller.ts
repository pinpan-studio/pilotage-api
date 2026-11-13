import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from './common/acteur';

export const VERSION_API = 'v1';

@Controller('sante')
export class SanteController {
  constructor(private readonly db: DataSource) {}
  @Public() @Get()
  async sante() {
    await this.db.query('SELECT 1');
    return { statut: 'ok', version_api: VERSION_API, heure: new Date().toISOString() };
  }
}
