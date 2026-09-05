import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
} from '@modelcontextprotocol/ext-apps/server';
import { APP_RESOURCE_URI } from './context';

/** Strict sandbox: no third-party scripts, styles, fonts or fetches. The app talks to the server only through `activate_api`. */
export const APP_UI_META = {
  csp: { connectDomains: [] as string[], resourceDomains: [] as string[] },
  prefersBorder: true,
};

const PLACEHOLDER_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Activate</title>
<style>body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#F4F3EF;color:#0F0F0F;padding:20px;margin:0}
code{background:#fff;border:1px solid #ddd;border-radius:6px;padding:2px 6px}</style></head>
<body><strong>Activate app bundle not built.</strong><p>Build the MCP app: <code>cd mcp-app &amp;&amp; yarn build</code>, then restart the API (or set <code>MCP_APP_HTML</code>).</p></body></html>`;

let cache: { path: string; mtimeMs: number; html: string } | null = null;

export function appHtmlPath(): string {
  return resolve(
    process.cwd(),
    process.env.MCP_APP_HTML ?? '../mcp-app/dist/app.html',
  );
}

/** Reads the single-file bundle (re-read when the file changes) or the placeholder when it is missing. */
export function loadAppHtml(): string {
  const path = appHtmlPath();
  if (!existsSync(path)) return PLACEHOLDER_HTML;
  const mtimeMs = statSync(path).mtimeMs;
  if (cache && cache.path === path && cache.mtimeMs === mtimeMs)
    return cache.html;
  const html = readFileSync(path, 'utf8');
  cache = { path, mtimeMs, html };
  return html;
}

export function registerAppResourceFor(server: McpServer) {
  return registerAppResource(
    server as unknown as Parameters<typeof registerAppResource>[0],
    'Activate',
    APP_RESOURCE_URI,
    {
      description:
        'Activate cards: ladder, library, skill detail, grades, scribe, team, org, promotion queue.',
      mimeType: RESOURCE_MIME_TYPE,
      _meta: { ui: APP_UI_META },
    },
    () => ({
      contents: [
        {
          uri: APP_RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: loadAppHtml(),
          _meta: { ui: APP_UI_META },
        },
      ],
    }),
  );
}
