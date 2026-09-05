import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InterviewSession } from '../interviews/entities/interview-session.entity';
import { RealtimeController } from './realtime.controller';

/** Mounted through InterviewsModule (app.module.ts is untouched); safe to import from AppModule directly too. */
@Module({
  imports: [TypeOrmModule.forFeature([InterviewSession])],
  controllers: [RealtimeController],
})
export class RealtimeModule {}
