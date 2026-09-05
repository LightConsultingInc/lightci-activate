import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PeopleService } from '../auth/people.service';
import { WorkosGuard } from '../auth/workos.guard';
import type { Person } from '../orgs/entities/person.entity';
import { type McpCaller, type RestResult } from './context';
import { SERVER_INSTRUCTIONS } from './instructions';
import { requestOrigin } from './oauth-metadata';
import { registerAppResourceFor } from './resource';
import { registerTools } from './tools/register';

/**
 * Per-request MCP server factory plus the REST bridge. Stateless: every HTTP request builds a fresh
 * McpServer bound to the calling Person, so tool handlers always know who is asking.
 */
@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  constructor(
    private readonly guard: WorkosGuard,
    private readonly people: PeopleService,
  ) {}

  /**
   * Identity for this request. The global WorkosGuard already ran (the controller is @Public so it
   * does not reject) and set `req.user` when the bearer token verified. Outside production,
   * MCP_DEV_USER_EMAIL lets a local MCP client act as that seeded person without OAuth.
   */
  async resolveCaller(req: Request): Promise<McpCaller | null> {
    const token = extractBearer(req.headers.authorization);
    const orgOverride =
      typeof req.headers['x-activate-org'] === 'string'
        ? req.headers['x-activate-org']
        : null;
    const origin = requestOrigin(req);

    let person: Person | null =
      (req as Request & { user?: Person }).user ?? null;
    if (!person && token) {
      try {
        person = await this.guard.resolveUser(token);
      } catch (error) {
        this.logger.debug(
          `MCP token rejected: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (person)
      return { person, token, orgOverride, devOverride: false, origin };

    const devEmail =
      process.env.NODE_ENV !== 'production'
        ? process.env.MCP_DEV_USER_EMAIL
        : undefined;
    if (devEmail) {
      const dev = await this.people.findByEmail(devEmail);
      if (dev) {
        this.logger.warn(`MCP dev override: acting as ${dev.email}`);
        return { person: dev, token, orgOverride, devOverride: true, origin };
      }
      this.logger.warn(`MCP_DEV_USER_EMAIL=${devEmail} matches no person`);
    }
    return null;
  }

  createServer(caller: McpCaller): McpServer {
    const server = new McpServer(
      { name: 'lightci-activate', title: 'LightCI Activate', version: '0.1.0' },
      {
        instructions: SERVER_INSTRUCTIONS,
        capabilities: { tools: {}, resources: {} },
      },
    );
    registerAppResourceFor(server);
    registerTools(server, caller, this);
    return server;
  }

  /**
   * The REST bridge. Calls the API over loopback as the caller (their bearer token is forwarded),
   * so every MCP tool reads and writes exactly what the web app does. `path` is relative to `/api`.
   */
  async callRest<T = unknown>(
    caller: McpCaller,
    path: string,
    method = 'GET',
    body?: unknown,
  ): Promise<RestResult<T>> {
    const port = process.env.PORT ?? 4000;
    const base =
      process.env.MCP_REST_BASE_URL ?? `http://127.0.0.1:${port}/api`;
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (caller.token) headers.Authorization = `Bearer ${caller.token}`;
    if (caller.orgOverride) headers['X-Activate-Org'] = caller.orgOverride;
    if (caller.devOverride)
      headers['X-Activate-Dev-User'] = caller.person.email; // honoured only if the guard opts in (dev)
    const hasBody = body !== undefined && body !== null && method !== 'GET';
    if (hasBody) headers['Content-Type'] = 'application/json';
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: hasBody ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(120_000),
      });
      const contentType = res.headers.get('content-type') ?? '';
      const text = await res.text();
      let parsed: unknown = text;
      if (contentType.includes('json') || /^[[{]/.test(text.trim())) {
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = text;
        }
      }
      return { status: res.status, contentType, body: parsed as T };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`REST bridge ${method} ${path} failed: ${detail}`);
      return {
        status: 502,
        contentType: 'application/json',
        body: {
          status: 502,
          title: 'Bad Gateway',
          detail: `Activate API unreachable: ${detail}`,
        } as T,
      };
    }
  }
}

export function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}
