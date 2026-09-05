import type { ZodType } from 'zod';
import type { AiCall } from './ai.service';

/**
 * Deterministic stand-ins for Claude, keyed by task. Used when AI_PROVIDER=mock
 * (E2E tests, offline demos). Agents register their own responders via
 * `registerMockResponder(task, fn)` so this file stays a thin registry.
 */
type Responder = (call: AiCall) => unknown;
const registry = new Map<string, Responder>();

export function registerMockResponder(task: string, fn: Responder) {
  registry.set(task, fn);
}

export function mockResponder<T>(
  call: AiCall,
  schema: ZodType<T> | undefined,
): T {
  const fn = registry.get(call.task);
  if (!fn) {
    if (call.task.endsWith('#text'))
      return {
        text: `[mock ${call.agent}] ${call.task.replace('#text', '')}`,
      } as T;
    throw new Error(`No mock responder registered for task "${call.task}"`);
  }
  const out = fn(call);
  if (schema) {
    const parsed = schema.safeParse(out);
    if (!parsed.success)
      throw new Error(
        `Mock responder for ${call.task} does not satisfy schema: ${parsed.error.message}`,
      );
    return parsed.data;
  }
  return out as T;
}
