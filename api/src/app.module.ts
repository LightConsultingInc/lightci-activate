import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { ClaudeEnterpriseModule } from './claude-enterprise/claude-enterprise.module';
import { McpModule } from './mcp/mcp.module';
import { SeedModule } from './seed/seed.module';
import { ContextModule } from './context/context.module';
import { HealthcheckModule } from './healthcheck/healthcheck.module';
import { InterviewsModule } from './interviews/interviews.module';
import { LearningModule } from './learning/learning.module';
import { OpsModule } from './ops/ops.module';
import { OrgsModule } from './orgs/orgs.module';
import { SkillsModule } from './skills/skills.module';
import AppDataSource from './typeorm.config';
import { WorkflowsModule } from './workflows/workflows.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({ ...AppDataSource.options, autoLoadEntities: true }),
    ScheduleModule.forRoot(),
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
    SeedModule,
  ],
})
export class AppModule {}
