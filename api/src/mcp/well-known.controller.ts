import { Controller, Get, Header, Logger, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../common/decorators';
import { OAuthService } from '../auth/oauth/oauth.service';
import { WorkosService } from '../auth/workos.service';
import {
  mergeAuthorizationServerMetadata,
  protectedResourceMetadata,
  requestOrigin,
  workosIssuer,
} from './oauth-metadata';

const UPSTREAM_TTL_MS = 10 * 60 * 1000;

/**
 * OAuth discovery for MCP hosts (claude.ai, Claude Desktop, Claude Code). Served outside the
 * `/api` prefix (see main.ts `exclude`). The resource is `<origin>/mcp`; WorkOS is the issuer.
 */
@Public()
@Controller('.well-known')
export class WellKnownController {
  private readonly logger = new Logger(WellKnownController.name);
  private upstream: { at: number; doc: Record<string, unknown> | null } | null =
    null;

  constructor(
    private readonly workos: WorkosService,
    private readonly oauth: OAuthService,
  ) {}

  @Get(['oauth-protected-resource', 'oauth-protected-resource/mcp'])
  @Header('Cache-Control', 'public, max-age=300')
  protectedResource(@Req() req: Request) {
    const origin = requestOrigin(req);
    if (this.oauth.enabled)
      return {
        ...protectedResourceMetadata(origin, this.workos.clientId),
        authorization_servers: [this.oauth.issuer],
      };
    return protectedResourceMetadata(origin, this.workos.clientId);
  }

  @Get([
    'oauth-authorization-server',
    'oauth-authorization-server/mcp',
    'openid-configuration',
  ])
  @Header('Cache-Control', 'public, max-age=300')
  async authorizationServer() {
    if (this.oauth.enabled) return this.oauth.metadata();
    const clientId = this.workos.clientId;
    return mergeAuthorizationServerMetadata(
      clientId,
      await this.fetchUpstream(clientId),
    );
  }

  /** WorkOS publishes `openid-configuration` per client id; `oauth-authorization-server` does not exist there. */
  private async fetchUpstream(
    clientId: string,
  ): Promise<Record<string, unknown> | null> {
    if (!clientId) return null;
    if (this.upstream && Date.now() - this.upstream.at < UPSTREAM_TTL_MS)
      return this.upstream.doc;
    let doc: Record<string, unknown> | null = null;
    try {
      const res = await fetch(
        `${workosIssuer(clientId)}/.well-known/openid-configuration`,
        { signal: AbortSignal.timeout(4000) },
      );
      if (res.ok) doc = (await res.json()) as Record<string, unknown>;
    } catch (error) {
      this.logger.debug(
        `WorkOS discovery unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    this.upstream = { at: Date.now(), doc };
    return doc;
  }
}
