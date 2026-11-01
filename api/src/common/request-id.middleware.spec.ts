import type { NextFunction, Request, Response } from 'express';
import { currentStore } from './request-context';
import { requestIdMiddleware } from './request-id.middleware';

function run(headers: Record<string, string>) {
  const req = { headers } as unknown as Request & { id?: string };
  const set: Record<string, string> = {};
  const res = {
    setHeader: (k: string, v: string) => {
      set[k] = v;
    },
  } as unknown as Response;
  let seen: string | undefined;
  const next: NextFunction = () => {
    seen = currentStore().requestId;
  };
  requestIdMiddleware(req, res, next);
  return { id: req.id, echoed: set['X-Request-Id'], seen };
}

describe('requestIdMiddleware (T0.9)', () => {
  it('honours a well-formed inbound id and echoes it', () => {
    const r = run({ 'x-request-id': 'alb-123.abc' });
    expect(r.id).toBe('alb-123.abc');
    expect(r.echoed).toBe('alb-123.abc');
    expect(r.seen).toBe('alb-123.abc');
  });

  it('replaces a malformed inbound id with a UUID', () => {
    const r = run({ 'x-request-id': 'bad id with spaces <script>' });
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.seen).toBe(r.id);
  });

  it('generates an id when none is given', () => {
    const r = run({});
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.echoed).toBe(r.id);
  });
});
