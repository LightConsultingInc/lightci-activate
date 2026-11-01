import { All, Controller, Logger, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Public } from '../common/decorators';
import { McpService } from './mcp.service';
import { wwwAuthenticate, requestOrigin } from './oauth-metadata';

/**
 * Streamable HTTP MCP endpoint at /mcp (outside the /api prefix). Stateless: each request gets a
 * fresh McpServer + transport bound to the authenticated Person. Marked @Public so the global guard
 * does not reject; auth is enforced here with RFC 9728 discovery hints so hosts can start OAuth.
 */
@Public()
@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(private readonly mcp: McpService) {}

  @All()
  async handle(@Req() req: Request, @Res() res: Response) {
    const caller = await this.mcp.resolveCaller(req);
    if (!caller) {
      res
        .status(401)
        .set('WWW-Authenticate', wwwAuthenticate(requestOrigin(req)))
        .json({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Unauthorized: sign in through the connector to get an access token',
          },
          id: null,
        });
      return;
    }

    const server = this.mcp.createServer(caller);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      this.logger.error(
        `MCP request failed: ${error instanceof Error ? error.stack : String(error)}`,
      );
      if (!res.headersSent)
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal error' },
          id: null,
        });
    }
  }
}
