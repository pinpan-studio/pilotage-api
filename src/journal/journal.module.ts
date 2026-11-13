import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { LimiteDebitMiddleware } from '../common/limite-debit';
import { JournalController } from './journal.controller';
import { JournalService } from './journal.service';

@Module({ controllers: [JournalController], providers: [JournalService] })
export class JournalModule implements NestModule {
  configure(c: MiddlewareConsumer) {
    c.apply(LimiteDebitMiddleware).forRoutes({ path: 'journal', method: RequestMethod.POST }, { path: 'mcp', method: RequestMethod.ALL });
  }
}
