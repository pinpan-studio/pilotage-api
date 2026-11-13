import { Module } from '@nestjs/common';
import { ExportController } from './export.controller';
import { LectureModule } from '../lecture/lecture.module';
@Module({ imports: [LectureModule], controllers: [ExportController] })
export class ExportModule {}
