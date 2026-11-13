import { Module } from '@nestjs/common';
import { ImportModule } from '../import/import.module';
import { ImportController, ProjetsController, ReferentielsController } from './lecture.controller';
import { LectureService } from './lecture.service';

@Module({ imports: [ImportModule], controllers: [ReferentielsController, ProjetsController, ImportController], providers: [LectureService], exports: [LectureService] })
export class LectureModule {}
