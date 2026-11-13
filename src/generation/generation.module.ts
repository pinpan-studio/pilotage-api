import { Module } from '@nestjs/common';
import { LectureModule } from '../lecture/lecture.module';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';
@Module({ imports: [LectureModule], controllers: [GenerationController], providers: [GenerationService], exports: [GenerationService] })
export class GenerationModule {}
