import type { ReactNode } from 'react';
import { decisionClass, initials, scoreLabel } from '../lib/format';
import type { BoundaryBadge, PersonRef } from '../types';

export function Pill({ tone, children, title }: { tone?: 'pass' | 'revise' | 'fail' | 'glow' | 'neutral'; children: ReactNode; title?: string }) {
  const cls = tone && tone !== 'neutral' ? ` pill-${tone}` : '';
  return <span className={`pill${cls}`} title={title}>{children}</span>;
}

export function DecisionPill({ decision, score }: { decision: string | null | undefined; score?: number | null }) {
  if (!decision && (score === null || score === undefined)) return <Pill>ungraded</Pill>;
  const tone = decisionClass(decision);
  return (
    <Pill tone={tone} title={`Grade ${scoreLabel(score)} / 10`}>
      {score !== null && score !== undefined ? <strong>{scoreLabel(score)}</strong> : null}
      <span>{decision ?? tone}</span>
    </Pill>
  );
}

export function BoundaryDot({ badge, withLabel = false }: { badge: BoundaryBadge; withLabel?: boolean }) {
  const label = badge === 'green' ? 'Boundary clear' : badge === 'amber' ? 'Human review point' : 'Restricted data';
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--fg-2)' }} title={label} data-testid={`boundary-${badge}`}>
      <span className={`dot dot-${badge}`} />
      {withLabel ? label : null}
    </span>
  );
}

export function Meter({ value, tone, height = 6 }: { value: number; tone?: 'pass' | 'revise' | 'fail' | 'glow'; height?: number }) {
  const v = Math.max(0, Math.min(1, value || 0));
  const color = tone && tone !== 'glow' ? `var(--${tone})` : 'var(--glow)';
  return (
    <span className="meter" style={{ height }} role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${v * 100}%`, background: color }} />
    </span>
  );
}

export function Avatar({ person, size = 26 }: { person: PersonRef | null | undefined; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }} title={person ? `${person.name} · ${person.title ?? person.email}` : 'Unassigned'}>
      {initials(person?.name)}
    </span>
  );
}

export function Tile({ value, label, hint, testId }: { value: ReactNode; label: string; hint?: string; testId?: string }) {
  return (
    <div className="tile" title={hint} data-testid={testId}>
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

export function Section({ title, count, right, children }: { title: string; count?: number; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="section-title !mb-0 flex items-center gap-2">
          {title}
          {count !== undefined ? <span className="pill">{count}</span> : null}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Sparkline({ points, width = 160, height = 36, stroke = 'var(--glow)' }: { points: number[]; width?: number; height?: number; stroke?: string }) {
  if (points.length === 0) return <svg width={width} height={height} aria-hidden />;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const coords = points.map((p, i) => [i * step, height - 3 - ((p - min) / span) * (height - 6)] as const);
  const d = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${d} L${width},${height} L0,${height} Z`;
  const last = coords[coords.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label="Hours back per week, last 8 weeks" role="img">
      <path d={area} fill={stroke} opacity={0.14} />
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={stroke} />
    </svg>
  );
}

export function Ring({ value, size = 84, label, sub }: { value: number; size?: number; label: string; sub?: string }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} data-testid="rung-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(v * 100)}% to next rung`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-3)" strokeWidth={6} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--glow)" strokeWidth={6} strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 400ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span style={{ fontSize: size * 0.26, fontWeight: 700, letterSpacing: '-0.02em' }}>{label}</span>
        {sub ? <span style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 3 }}>{sub}</span> : null}
      </div>
    </div>
  );
}

export function Glyph({ kind }: { kind: 'empty' | 'error' | 'loading' | 'done' }) {
  const stroke = kind === 'error' ? 'var(--fail)' : kind === 'done' ? 'var(--pass)' : 'var(--glow)';
  return (
    <svg width={40} height={40} viewBox="0 0 40 40" fill="none" aria-hidden>
      <circle cx="20" cy="20" r="17" stroke={stroke} strokeWidth="1.5" opacity="0.5" />
      {kind === 'empty' && <path d="M12 22h16M12 17h10" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />}
      {kind === 'error' && <path d="M20 12v10M20 27v1" stroke={stroke} strokeWidth="2" strokeLinecap="round" />}
      {kind === 'done' && <path d="M13 20l5 5 9-10" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
      {kind === 'loading' && <path d="M20 8a12 12 0 0 1 12 12" stroke={stroke} strokeWidth="2" strokeLinecap="round" className="spin" style={{ transformOrigin: '20px 20px', animation: 'spin 900ms linear infinite' }} />}
      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
    </svg>
  );
}

export function StateBlock({ kind, title, detail, testId, action }: { kind: 'empty' | 'error' | 'loading' | 'done'; title: string; detail?: string; testId?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 px-6 py-8" data-testid={testId}>
      <Glyph kind={kind} />
      <div className="text-[13px] font-semibold">{title}</div>
      {detail ? <div className="text-[12px] max-w-[420px]" style={{ color: 'var(--fg-2)' }}>{detail}</div> : null}
      {action}
    </div>
  );
}
