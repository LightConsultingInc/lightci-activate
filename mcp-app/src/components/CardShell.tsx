import type { ReactNode } from 'react';
import type { Viewer } from '../lib/envelope';
import { rungLabel } from '../lib/format';

export interface ShellProps {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  webUrl?: string;
  onOpenWeb: (url: string) => void;
  fullscreen: boolean;
  canFullscreen: boolean;
  onToggleFullscreen: () => void;
  viewer?: Viewer;
  testId: string;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function CardShell(p: ShellProps) {
  return (
    <article className={`card${p.fullscreen ? ' fullscreen' : ''}`} data-testid={p.testId}>
      <header className="flex items-start justify-between gap-3 px-4 pt-3 pb-2">
        <div className="min-w-0">
          <div className="eyebrow">{p.eyebrow}</div>
          <div className="text-[15px] font-semibold leading-tight truncate mt-0.5">{p.title}</div>
          {p.subtitle ? <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--fg-2)' }}>{p.subtitle}</div> : null}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {p.actions}
          {p.webUrl ? (
            <button className="btn btn-sm btn-ghost" onClick={() => p.onOpenWeb(p.webUrl!)} data-testid="action-open-web" title="Open in the Activate web app">
              Open in Activate <span aria-hidden>↗</span>
            </button>
          ) : null}
          {p.canFullscreen ? (
            <button className="btn btn-sm btn-ghost" onClick={p.onToggleFullscreen} data-testid="action-fullscreen" title={p.fullscreen ? 'Back to inline' : 'Expand'} aria-label={p.fullscreen ? 'Back to inline' : 'Expand'}>
              {p.fullscreen ? '⤡' : '⤢'}
            </button>
          ) : null}
        </div>
      </header>
      <div className="hairline" />
      <div>{p.children}</div>
      <div className="hairline" />
      <footer className="flex items-center justify-between px-4 py-2 text-[11px]" style={{ color: 'var(--fg-3)' }}>
        <span>{p.viewer?.name ? `${p.viewer.name} · ${rungLabel(p.viewer.rung)}` : 'Activate'}</span>
        {p.footer ?? <span>LightCI Activate</span>}
      </footer>
    </article>
  );
}
