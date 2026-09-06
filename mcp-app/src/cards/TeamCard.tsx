import { useState } from 'react';
import { CardShell } from '../components/CardShell';
import { Avatar, DecisionPill, Pill, Section, Tile } from '../components/ui';
import { hours, num, pct, rungLabel, shortDate } from '../lib/format';
import type { TeamView } from '../types';
import { errorMessage, type CardProps } from './shared';

export function TeamCard({ envelope, api, shell }: CardProps<TeamView>) {
  const [team, setTeam] = useState<TeamView>(envelope.data);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const approve = async (submissionId: string, title: string) => {
    setBusy(submissionId);
    setNote(null);
    try {
      await api(`/team/reviews/${submissionId}/grade`, { method: 'POST', body: { decision: 'pass', rubric: [], feedback: 'Approved from Claude' } });
      const fresh = await api<TeamView>(`/team?teamId=${encodeURIComponent(team.team.id)}`);
      setTeam(fresh.body);
      setNote(`Approved "${title}". Your agreement with the Grader is recorded as an L5 review.`);
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const stalled = team.roster.filter((r) => r.stalled).length;
  const dist = team.stats.rungDistribution ?? [];
  const distMax = Math.max(1, ...dist);

  return (
    <CardShell
      {...shell}
      eyebrow="Team"
      title={team.team.name}
      subtitle={<span>{team.roster.length} people · champion {team.team.champion?.name ?? 'unassigned'}{team.team.plugin ? ` · plugin ${team.team.plugin}` : ''}</span>}
      webUrl={envelope.links.web}
      viewer={envelope.viewer}
      testId="card-team"
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-3">
        <Tile value={pct(team.stats.activePct7d)} label="active on real work · 7d" />
        <Tile value={`${num(team.stats.hoursBackPerWeek)}h`} label="hours back / week" />
        <Tile value={team.stats.skillsPublished} label="skills published" />
        <Tile value={team.stats.promotionsPending} label="promotions pending" />
      </div>

      <div className="hairline" />
      <Section title="Roster" count={team.roster.length} right={stalled > 0 ? <Pill tone="fail">{stalled} stalled</Pill> : <Pill tone="pass">no one stalled</Pill>}>
        <div className="scroll-x">
          <div className="flex gap-2 pb-1" data-testid="roster-strip">
            {team.roster.map((p) => (
              <div key={p.id} className="panel p-2 min-w-[150px] flex flex-col gap-1 text-[11.5px]" data-testid="roster-person" style={p.stalled ? { borderColor: 'color-mix(in srgb, var(--fail) 50%, transparent)' } : undefined}>
                <div className="flex items-center gap-1.5">
                  <Avatar person={p} size={22} />
                  <div className="min-w-0"><div className="font-semibold truncate text-[12px]">{p.name}</div><div style={{ color: 'var(--fg-3)' }}>{rungLabel(p.rung)}</div></div>
                </div>
                <div style={{ color: 'var(--fg-2)' }}>{hours((p.hoursBackPerWeek ?? 0) * 60)}/wk back · {p.activeDays30 ?? 0}d active</div>
                <div className="flex gap-1 flex-wrap">
                  {p.stalled ? <Pill tone="fail">stalled {p.stalledDays ?? ''}d</Pill> : null}
                  {(p.revisitsOverdue ?? 0) > 0 ? <Pill tone="revise">{p.revisitsOverdue} revisits overdue</Pill> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
        {dist.length ? (
          <div className="flex items-end gap-1 mt-2 h-6" title="Rung distribution L0–L5" aria-label="Rung distribution">
            {dist.map((n, i) => (
              <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
                <div className="w-full rounded-sm" style={{ height: `${Math.max(2, (n / distMax) * 16)}px`, background: n ? 'var(--glow)' : 'var(--bg-3)' }} />
                <span className="text-[9px]" style={{ color: 'var(--fg-3)' }}>L{i}</span>
              </div>
            ))}
          </div>
        ) : null}
      </Section>

      <div className="hairline" />
      <div className="grid sm:grid-cols-2">
        <Section title="Backlog · top 5">
          <ol className="m-0 p-0 list-none flex flex-col gap-1.5 text-[12px]">
            {team.backlogTop.slice(0, 5).map((w, i) => {
              const score = typeof w.score === 'number' ? w.score : w.score?.composite;
              return (
                <li key={w.id} className="flex items-start gap-2" data-testid="backlog-row">
                  <span className="shrink-0 w-4 text-right font-semibold" style={{ color: 'var(--fg-3)' }}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5"><span className="font-medium truncate">{w.name}</span>{w.nextWave ? <Pill tone="glow">next wave</Pill> : null}</div>
                    <div className="text-[11px]" style={{ color: 'var(--fg-3)' }}>{w.status.replace(/_/g, ' ')} · {w.owner?.name ?? 'no owner'} · {w.baselineMinutesPerWeek ? `${hours(w.baselineMinutesPerWeek)}/wk at stake` : 'no baseline'}</div>
                  </span>
                  {score !== undefined && score !== null ? <span className="shrink-0 text-[11px]" style={{ color: 'var(--fg-2)' }} title="Scorer composite, 0–100">{Math.round(score)}</span> : null}
                </li>
              );
            })}
          </ol>
        </Section>
        <Section title="Review queue" count={team.reviewQueue.length}>
          {team.reviewQueue.length === 0 ? <div className="text-[12px]" style={{ color: 'var(--fg-3)' }}>Nothing waiting on you.</div> : (
            <ul className="m-0 p-0 list-none flex flex-col gap-2 text-[12px]">
              {team.reviewQueue.slice(0, 5).map((r) => (
                <li key={r.submission.id} className="panel p-2 flex flex-col gap-1" data-testid="review-row">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0"><span className="font-medium">{r.person.name}</span> <span style={{ color: 'var(--fg-3)' }}>· {r.exercise.title}</span></span>
                    {r.submission.grade ? <DecisionPill decision={r.submission.grade.decision} score={r.submission.grade.score} /> : <Pill>Grader pending</Pill>}
                  </div>
                  <div className="text-[11.5px] line-clamp-2" style={{ color: 'var(--fg-2)' }}>Critique: {r.submission.critiqueText}</div>
                  <div className="flex items-center gap-2">
                    <button className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => approve(r.submission.id, r.exercise.title)} data-testid="action-approve">{busy === r.submission.id ? 'Approving…' : 'Approve'}</button>
                    <span className="text-[11px]" style={{ color: 'var(--fg-3)' }}>attempt {r.submission.attempt} · {shortDate(r.submission.submittedAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {team.promotionQueue.length > 0 ? <div className="mt-2 text-[11.5px]" style={{ color: 'var(--fg-2)' }}>{team.promotionQueue.length} promotion{team.promotionQueue.length === 1 ? '' : 's'} waiting — ask for the promotion queue.</div> : null}
          {note ? <div className="mt-1.5 text-[11.5px]" style={{ color: 'var(--fg-2)' }}>{note}</div> : null}
        </Section>
      </div>
    </CardShell>
  );
}
