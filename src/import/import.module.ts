import { Module } from '@nestjs/common';
import { ImportKitService } from './import-kit.service';

@Module({ providers: [ImportKitService], exports: [ImportKitService] })
export class ImportModule {}
