import type { Person } from '../orgs/entities/person.entity';

/** Who is calling the MCP server on this request, and how to act on their behalf against the REST layer. */
export interface McpCaller {
  person: Person;
  /** Raw bearer token from the MCP request; forwarded to the REST layer so tools run as the caller. */
  token: string | null;
  /** Lead org override (`X-Activate-Org`), forwarded as-is. */
  orgOverride: string | null;
  /** True when identity came from MCP_DEV_USER_EMAIL rather than a verified token. */
  devOverride: boolean;
  /** Public origin of this API as seen by the host, e.g. https://lightci-activate-api.lciventure.com */
  origin: string;
}

export type ToolName =
  | 'my_ladder'
  | 'library'
  | 'skill_detail'
  | 'submit_skill'
  | 'submit_artifact'
  | 'map_workflow'
  | 'team'
  | 'org'
  | 'promotion_queue';

export interface RestResult<T = unknown> {
  status: number;
  contentType: string;
  body: T;
}

export interface ToolError {
  status: number;
  title: string;
  detail: string;
}

/**
 * Every Activate tool result carries this envelope in `structuredContent`. `data` is the REST
 * payload verbatim (three renderers, one payload); the MCP App routes on `tool`.
 */
export interface ToolEnvelope<T = unknown> {
  tool: ToolName;
  data: T | null;
  links: { web: string };
  viewer: {
    id: string;
    name: string;
    email: string;
    roles: string[];
    rung: number | null;
  };
  input?: Record<string, unknown>;
  error?: ToolError;
}

export const APP_RESOURCE_URI = 'ui://activate/app.html';

export function webUrl(path = '/'): string {
  const base = (process.env.WEB_URL ?? 'http://localhost:3000')
    .split(',')[0]
    .replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function toolError(result: RestResult): ToolError {
  const b = (result.body ?? {}) as {
    title?: string;
    detail?: string;
    message?: string;
  };
  return {
    status: result.status,
    title:
      b.title ??
      (result.status === 401
        ? 'Unauthorized'
        : result.status === 403
          ? 'Forbidden'
          : result.status === 404
            ? 'Not Found'
            : 'Error'),
    detail: b.detail ?? b.message ?? `Activate API returned ${result.status}`,
  };
}

export function viewerOf(
  person: Person,
  rung: number | null = null,
): ToolEnvelope['viewer'] {
  return {
    id: person.id,
    name: person.name,
    email: person.email,
    roles: person.roles,
    rung,
  };
}
