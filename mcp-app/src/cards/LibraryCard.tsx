import { useMemo, useState } from 'react';
import { CardShell } from '../components/CardShell';
import { Avatar, BoundaryDot, DecisionPill, Pill, StateBlock } from '../components/ui';
import type { LibraryPayload, SkillCard } from '../types';
import { errorMessage, type CardProps } from './shared';

export function LibraryCard({ envelope, api, shell }: CardProps<LibraryPayload>) {
  const [data, setData] = useState<LibraryPayload>(envelope.data);
  const [team, setTeam] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const skills = useMemo(() => (team ? data.skills.filter((s) => s.team?.id === team) : data.skills), [data, team]);

  const act = async (skill: SkillCard, action: 'adopt' | 'fork') => {
    setBusy(`${skill.id}:${action}`);
    setNote(null);
    try {
      const res = await api<{ skill?: SkillCard; slug?: string }>(`/skills/${skill.id}/${action}`, { method: 'POST' });
      const fresh = await api<LibraryPayload>('/library');
      setData(fresh.body);
      setNote(action === 'adopt' ? `Adopted ${skill.name}. Coach queued an "adopt on your case" exercise.` : `Forked ${skill.name} as a draft${res.body?.slug ? ` (${res.body.slug})` : ''}. Edit it with Claude, then submit.`);
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const filterLabel = envelope.input && Object.keys(envelope.input).length ? Object.entries(envelope.input).filter(([, v]) => v).map(([k, v]) => `${k}: ${String(v)}`).join(' · ') : null;

  return (
    <CardShell
      {...shell}
      eyebrow="Skill library"
      title={<span>{data.skills.length} skills{filterLabel ? <span style={{ color: 'var(--fg-3)', fontWeight: 500 }}> · {filterLabel}</span> : null}</span>}
      webUrl={envelope.links.web}
      viewer={envelope.viewer}
      testId="card-library"
    >
      {data.facets?.teams && data.facets.teams.length > 1 ? (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3">
          <button className={`pill${team === null ? ' pill-glow' : ''}`} onClick={() => setTeam(null)}>All</button>
          {data.facets.teams.map((t) => (
            <button key={t.id} className={`pill${team === t.id ? ' pill-glow' : ''}`} onClick={() => setTeam(t.id)}>{t.name} <span style={{ opacity: 0.6 }}>{t.count}</span></button>
          ))}
        </div>
      ) : null}

      {skills.length === 0 ? (
        <StateBlock kind="empty" title="No skills match" detail="Nothing published for this filter yet. Try another team, or map a workflow and build the first one." testId="card-empty" />
      ) : (
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          {skills.map((s) => (
            <div key={s.id} className="panel p-3 flex flex-col gap-2" data-testid="skill-tile">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold truncate">{s.name}</div>
                  <div className="text-[11px] truncate" style={{ color: 'var(--fg-3)' }}>{s.plugin ?? s.team?.name ?? 'unassigned'} · v{s.version}</div>
                </div>
                <BoundaryDot badge={s.boundaryBadge} />
              </div>
              <p className="m-0 text-[12px] line-clamp-2" style={{ color: 'var(--fg-2)' }}>{s.triggerLine}</p>
              <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: 'var(--fg-2)' }}>
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <Avatar person={s.owner} size={18} />
                  <span className="truncate">{s.owner?.name ?? 'No owner'}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 shrink-0">
                  <span title="Active users, last 30 days">{s.activeUsers30d} active</span>
                  <DecisionPill decision={s.grade?.decision} score={s.grade?.score} />
                </span>
              </div>
              {s.health && s.health.length > 0 ? (
                <div className="flex flex-wrap gap-1">{s.health.map((h) => <Pill key={h} tone={h === 'pending_review' ? 'glow' : 'revise'}>{h.replace(/_/g, ' ')}</Pill>)}</div>
              ) : null}
              <div className="flex items-center gap-1.5 mt-auto">
                <button className="btn btn-sm btn-primary" disabled={busy !== null || s.adoptedByMe || s.status !== 'published'} onClick={() => act(s, 'adopt')} data-testid="action-adopt">
                  {s.adoptedByMe ? 'Adopted' : busy === `${s.id}:adopt` ? 'Adopting…' : 'Adopt'}
                </button>
                <button className="btn btn-sm" disabled={busy !== null} onClick={() => act(s, 'fork')} data-testid="action-fork">
                  {busy === `${s.id}:fork` ? 'Forking…' : 'Fork'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {note ? <div className="px-4 pb-3 text-[11.5px]" style={{ color: 'var(--fg-2)' }} data-testid="library-note">{note}</div> : null}
    </CardShell>
  );
}
