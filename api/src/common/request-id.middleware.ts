import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { requestContext } from './request-context';

const HEADER = 'x-request-id';
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Give every request an id before Nest sees it. Honours a well-formed inbound
 * X-Request-Id (from a load balancer or the web app), echoes it on the response,
 * and seeds the AsyncLocalStorage store so every log line in the request carries it.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const inbound = req.headers[HEADER];
  const id =
    typeof inbound === 'string' && SAFE_ID.test(inbound)
      ? inbound
      : randomUUID();
  (req as Request & { id?: string }).id = id;
  res.setHeader('X-Request-Id', id);
  requestContext.run({ requestId: id }, next);
}
