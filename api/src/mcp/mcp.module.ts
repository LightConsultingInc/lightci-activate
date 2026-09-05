import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { WellKnownController } from './well-known.controller';

/** Remote MCP server + MCP Apps resource. Import from AppModule (not done here; see orchestrator notes). */
@Module({
  imports: [AuthModule],
  controllers: [McpController, WellKnownController],
  providers: [McpService],
  exports: [McpService],
})
export class McpModule {}
