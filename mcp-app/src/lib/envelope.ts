export const TOOL_NAMES = [
  'my_ladder',
  'library',
  'skill_detail',
  'submit_skill',
  'submit_artifact',
  'map_workflow',
  'team',
  'org',
  'promotion_queue',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface Viewer {
  id: string;
  name: string;
  email: string;
  roles: string[];
  rung: number | null;
}

export interface EnvelopeError {
  status: number;
  title: string;
  detail: string;
}

export interface ToolEnvelope<T = unknown> {
  tool: ToolName;
  data: T;
  links: { web: string };
  viewer: Viewer;
  input?: Record<string, unknown>;
  error?: EnvelopeError;
}

export function isToolName(x: unknown): x is ToolName {
  return typeof x === 'string' && (TOOL_NAMES as readonly string[]).includes(x);
}

export function asEnvelope(x: unknown): ToolEnvelope | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (!isToolName(o.tool)) return null;
  return {
    tool: o.tool,
    data: o.data,
    links: (o.links as { web: string } | undefined) ?? { web: '' },
    viewer: (o.viewer as Viewer | undefined) ?? { id: '', name: '', email: '', roles: [], rung: null },
    input: o.input as Record<string, unknown> | undefined,
    error: o.error as EnvelopeError | undefined,
  };
}
