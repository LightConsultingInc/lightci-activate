import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { ClaudeEnterpriseModule } from './claude-enterprise/claude-enterprise.module';
import { seedEnabled } from './config/env';
import { McpModule } from './mcp/mcp.module';
import { SeedModule } from './seed/seed.module';
import { ContextModule } from './context/context.module';
import { HealthcheckModule } from './healthcheck/healthcheck.module';
import { InterviewsModule } from './interviews/interviews.module';
import { JobsModule } from './jobs/jobs.module';
import { LearningModule } from './learning/learning.module';
import { LoggingModule } from './logging/logging.module';
import { OpsModule } from './ops/ops.module';
import { OrgsModule } from './orgs/orgs.module';
import { SkillsModule } from './skills/skills.module';
import AppDataSource from './typeorm.config';
import { WorkflowsModule } from './workflows/workflows.module';

@Module({
  imports: [
    LoggingModule,
    TypeOrmModule.forRoot({ ...AppDataSource.options, autoLoadEntities: true }),
    JobsModule,
    HealthcheckModule,
    AiModule,
    AuthModule,
    OrgsModule,
    ContextModule,
    LearningModule,
    WorkflowsModule,
    SkillsModule,
    OpsModule,
    InterviewsModule,
    ClaudeEnterpriseModule,
    McpModule,
    // Demo seed (routes and SEED_ON_BOOT) exists only where seedEnabled() allows it:
    // cloud non-production, or an explicit ACTIVATE_ALLOW_SEED=true.
    ...(seedEnabled() ? [SeedModule] : []),
  ],
})
export class AppModule {}
