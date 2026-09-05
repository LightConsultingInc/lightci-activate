import { useState } from 'react';
import { CardShell } from '../components/CardShell';
import { Meter, Pill, Ring, Section, Sparkline } from '../components/ui';
import { RUNGS, hours, pct, relDays, rungLabel, decisionClass, scoreLabel } from '../lib/format';
import type { ExerciseSummary, LadderView } from '../types';
import { errorMessage, type CardProps } from './shared';

export function LadderCard({ envelope, api, shell, sendMessage }: CardProps<LadderView>) {
  const [view, setView] = useState<LadderView>(envelope.data);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const start = async (ex: ExerciseSummary) => {
    setBusy(ex.id);
    setNote(null);
    try {
      await api(`/exercises/${ex.id}/start`, { method: 'POST' });
      const fresh = await api<LadderView>('/ladder/me');
      setView(fresh.body);
      setNote(`Started "${ex.title}". Tell Claude your expectation before you run it.`);
      if (sendMessage) void sendMessage(`I started the exercise "${ex.title}". Coach me through it: ask for my expectation first.`);
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const rung = RUNGS[view.rung];
  const next = view.nextRung !== null ? RUNGS[view.nextRung] : null;
  const hb = view.hoursBack;
  const weekly = hb.baselineMinutesPerWeek > 0 ? (hb.baselineMinutesPerWeek - hb.currentMinutesPerWeek) / hb.baselineMinutesPerWeek : 0;

  return (
    <CardShell
      {...shell}
      eyebrow="Your ladder"
      title={<span>{rungLabel(view.rung)}{next ? <span style={{ color: 'var(--fg-3)', fontWeight: 500 }}> · {pct(view.progress.toNextRung)} to {next.code}</span> : null}</span>}
      subtitle={rung ? `Competency: ${view.competencies.filter((c) => c.rung === view.rung).map((c) => c.name).join(', ') || rung.name}` : undefined}
      webUrl={envelope.links.web}
      viewer={envelope.viewer}
      testId="card-ladder"
    >
      <div className="grid gap-0 sm:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-4 px-4 py-3">
          <Ring value={view.progress.toNextRung} label={rung?.code ?? `L${view.rung}`} sub={next ? `→ ${next.code}` : 'top'} />
          <div className="flex flex-col gap-1.5 text-[11.5px]" style={{ color: 'var(--fg-2)' }}>
            {view.progress.met ? (
              (['mastery', 'contexts', 'judgement', 'retention'] as const).map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span className={`dot ${view.progress.met![k] ? 'dot-green' : 'dot-amber'}`} />
                  {k === 'mastery' ? 'Mastery' : k === 'contexts' ? 'Contexts' : k === 'judgement' ? 'Judgement' : 'Retention'}
                  {k === 'mastery' && view.progress.gate ? <span style={{ color: 'var(--fg-3)' }}>≥ {pct(view.progress.gate.masteryThreshold)}</span> : null}
                </span>
              ))
            ) : null}
            {view.streak ? (
              <span className="inline-flex items-center gap-1 mt-1" title={`${view.streak.activeDays} active days in the last 14`}>
                {view.streak.last14.map((d) => <span key={d.day} className="dot" style={{ width: 6, height: 6, background: d.active ? 'var(--glow)' : 'var(--bg-3)' }} />)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="px-4 py-3 sm:border-l" style={{ borderColor: 'var(--line)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="section-title">Hours back</div>
              <div className="text-[20px] font-semibold leading-none">{hours(hb.thisMonthMinutes)} <span className="text-[11px] font-normal" style={{ color: 'var(--fg-3)' }}>this month</span></div>
              <div className="text-[11.5px] mt-1" style={{ color: 'var(--fg-2)' }}>
                {hours(hb.currentMinutesPerWeek)}/wk now vs {hours(hb.baselineMinutesPerWeek)}/wk baseline
                {weekly > 0 ? <span style={{ color: 'var(--pass)' }}> · {pct(weekly)} faster</span> : null}
              </div>
            </div>
            <Sparkline points={hb.series.map((s) => s.minutesBack)} />
          </div>
        </div>
      </div>

      <div className="hairline" />

      <Section title="Next up">
        {view.nextUp ? (
          <div className="panel p-3 flex flex-col gap-2" data-testid="next-exercise">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold">{view.nextUp.title}</div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--fg-3)' }}>
                  L{view.nextUp.rung} · {view.nextUp.kind} · {view.nextUp.estimatedMinutes ?? '?'} min{view.nextUp.contextTag ? ` · ${view.nextUp.contextTag}` : ''}
                </div>
              </div>
              <button className="btn btn-primary btn-sm shrink-0" disabled={busy !== null} onClick={() => start(view.nextUp!)} data-testid="action-start-exercise">
                {busy === view.nextUp.id ? 'Starting…' : view.nextUp.status === 'active' ? 'Continue' : 'Start'}
              </button>
            </div>
            <p className="text-[12px] m-0" style={{ color: 'var(--fg-2)' }}>{view.nextUp.brief}</p>
            {view.nextUp.rationale ? <p className="text-[11.5px] m-0 italic" style={{ color: 'var(--fg-3)' }}>Why this: {view.nextUp.rationale}</p> : null}
          </div>
        ) : (
          <div className="text-[12px]" style={{ color: 'var(--fg-2)' }}>Nothing queued. Ask Coach for an exercise on something you have to do this week.</div>
        )}
        {note ? <div className="text-[11.5px] mt-2" style={{ color: 'var(--fg-2)' }}>{note}</div> : null}
      </Section>

      <div className="hairline" />

      <div className="grid sm:grid-cols-2">
        <Section title="Revisits due" count={view.revisitsDue.length}>
          {view.revisitsDue.length === 0 ? (
            <div className="text-[12px]" style={{ color: 'var(--fg-3)' }}>Nothing due. Retention is holding.</div>
          ) : (
            <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
              {view.revisitsDue.slice(0, 4).map((r) => (
                <li key={r.id} className="text-[12px] flex items-start gap-2" data-testid="revisit">
                  <span className={`dot mt-1.5 shrink-0 ${r.overdue ? 'dot-red' : 'dot-amber'}`} />
                  <span>
                    <span className="font-medium">{r.competencyName}</span>
                    <span style={{ color: r.overdue ? 'var(--fail)' : 'var(--fg-3)' }}> · {relDays(r.dueAt)}</span>
                    <div style={{ color: 'var(--fg-2)' }}>{r.prompt}</div>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Competencies">
          <ul className="m-0 p-0 list-none flex flex-col gap-2">
            {view.competencies.slice(0, 5).map((c) => (
              <li key={c.code} className="text-[11.5px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{c.name} <span style={{ color: 'var(--fg-3)' }}>{c.code}</span></span>
                  <span className="shrink-0" style={{ color: c.status === 'decayed' ? 'var(--fail)' : 'var(--fg-2)' }}>{pct(c.mastery)}{c.status === 'decayed' ? ' ↓' : ''}</span>
                </div>
                <Meter value={c.mastery} tone={c.mastery >= c.threshold ? 'pass' : c.status === 'decayed' ? 'fail' : 'glow'} height={4} />
              </li>
            ))}
          </ul>
        </Section>
      </div>

      {view.recentGrades && view.recentGrades.length > 0 ? (
        <>
          <div className="hairline" />
          <Section title="Recent grades">
            <div className="flex flex-wrap gap-1.5">
              {view.recentGrades.slice(0, 4).map((g) => (
                <Pill key={g.submissionId} tone={decisionClass(g.decision)} title={g.exerciseTitle}>
                  <strong>{scoreLabel(g.score)}</strong> {g.exerciseTitle.length > 28 ? `${g.exerciseTitle.slice(0, 28)}…` : g.exerciseTitle}
                </Pill>
              ))}
            </div>
          </Section>
        </>
      ) : null}
    </CardShell>
  );
}
