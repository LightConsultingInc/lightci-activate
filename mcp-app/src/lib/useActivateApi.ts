import { useCallback } from 'react';
import type { App } from '@modelcontextprotocol/ext-apps';
import { mockApi } from '../fixtures';

export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface ApiInit {
  method?: ApiMethod;
  body?: unknown;
}

export interface ApiResponse<T> {
  status: number;
  body: T;
}

export class ApiError extends Error {
  constructor(public status: number, public title: string, public detail: string) {
    super(detail || title || `HTTP ${status}`);
  }
}

interface BrokerResult {
  status?: number;
  contentType?: string;
  body?: unknown;
}

/**
 * Fetch-like access to the Activate REST layer through the app-only `activate_api` broker tool.
 * `path` is relative to the REST prefix (e.g. `/ladder/me`). In mock mode (or without a host) it
 * resolves from fixtures so cards can be eyeballed without an MCP host.
 */
export function useActivateApi(app: App | null, mock: boolean) {
  return useCallback(
    async <T = unknown>(path: string, init: ApiInit = {}): Promise<ApiResponse<T>> => {
      const method = init.method ?? 'GET';
      if (mock || !app) {
        await new Promise((r) => setTimeout(r, 180));
        const res = mockApi(path, method, init.body);
        if (res.status >= 400) {
          const b = res.body as { title?: string; detail?: string } | null;
          throw new ApiError(res.status, b?.title ?? 'Error', b?.detail ?? 'Request failed');
        }
        return { status: res.status, body: res.body as T };
      }
      const result = await app.callServerTool({
        name: 'activate_api',
        arguments: { path, method, ...(init.body === undefined ? {} : { body: init.body }) },
      });
      const sc = (result.structuredContent ?? {}) as BrokerResult;
      const status = sc.status ?? (result.isError ? 500 : 200);
      if (result.isError || status >= 400) {
        const b = (sc.body ?? {}) as { title?: string; detail?: string; message?: string };
        const text = result.content?.find((c) => c.type === 'text');
        throw new ApiError(status, b.title ?? 'Error', b.detail ?? b.message ?? (text && 'text' in text ? String(text.text) : 'Request failed'));
      }
      return { status, body: sc.body as T };
    },
    [app, mock],
  );
}

export type ActivateApi = ReturnType<typeof useActivateApi>;
