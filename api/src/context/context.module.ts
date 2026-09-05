import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../ops/entities/audit-log.entity';
import { Team } from '../orgs/entities/team.entity';
import { ContextController } from './context.controller';
import { ContextService } from './context.service';
import { ContextSource } from './entities/context-source.entity';
import { ContextLayer } from './entities/context-layer.entity';

/** Three layers of context (company / team / person): reviewable sources and AI-compiled layers. */
@Module({
  imports: [
    TypeOrmModule.forFeature([ContextSource, ContextLayer, Team, AuditLog]),
  ],
  controllers: [ContextController],
  providers: [ContextService],
  exports: [TypeOrmModule, ContextService],
})
export class ContextModule {}
