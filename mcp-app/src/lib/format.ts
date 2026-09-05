export const RUNGS: Record<number, { code: string; name: string }> = {
  0: { code: 'L0', name: 'Orientation' },
  1: { code: 'L1', name: 'Conversational' },
  2: { code: 'L2', name: 'Context' },
  3: { code: 'L3', name: 'Skill' },
  4: { code: 'L4', name: 'Workflow' },
  5: { code: 'L5', name: 'Champion' },
};

export function rungLabel(rung: number | null | undefined): string {
  if (rung === null || rung === undefined) return '—';
  const r = RUNGS[rung];
  return r ? `${r.code} ${r.name}` : `L${rung}`;
}

export function pct(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(digits)}%`;
}

export function hours(minutes: number | null | undefined, digits = 1): string {
  if (minutes === null || minutes === undefined) return '—';
  return `${(minutes / 60).toFixed(digits)}h`;
}

export function num(x: number | null | undefined): string {
  if (x === null || x === undefined) return '—';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(x);
}

export function usd(x: number | null | undefined): string {
  if (x === null || x === undefined) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(x);
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function relDays(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return iso;
  const days = Math.round((d - Date.now()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days < 0 ? `${-days}d overdue` : `in ${days}d`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function decisionClass(decision: string | null | undefined): 'pass' | 'revise' | 'fail' {
  const d = (decision ?? '').toLowerCase();
  if (d === 'pass' || d === 'approved' || d === 'merged') return 'pass';
  if (d === 'fail' || d === 'rejected') return 'fail';
  return 'revise';
}

export function scoreLabel(score: number | null | undefined): string {
  if (score === null || score === undefined) return '—';
  return (score * 10).toFixed(1);
}

export function titleCase(s: string): string {
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
