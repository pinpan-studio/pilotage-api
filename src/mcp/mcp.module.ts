import { Module } from '@nestjs/common';
import { LectureModule } from '../lecture/lecture.module';
import { McpController } from './mcp.controller';

@Module({ imports: [LectureModule], controllers: [McpController] })
export class McpModule {}
