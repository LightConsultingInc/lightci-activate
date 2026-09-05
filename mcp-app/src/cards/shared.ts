import type { ToolEnvelope } from '../lib/envelope';
import type { ActivateApi } from '../lib/useActivateApi';
import type { ShellProps } from '../components/CardShell';

export type ShellBase = Pick<ShellProps, 'onOpenWeb' | 'fullscreen' | 'canFullscreen' | 'onToggleFullscreen'>;

export interface CardProps<T> {
  envelope: ToolEnvelope<T>;
  api: ActivateApi;
  shell: ShellBase;
  /** Ask Claude to continue the conversation with this text (host sendMessage), if available. */
  sendMessage?: (text: string) => Promise<boolean>;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
