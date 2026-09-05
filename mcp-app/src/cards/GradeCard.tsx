import { useState } from 'react';
import { CardShell } from '../components/CardShell';
import { DecisionPill, Meter, Pill, Section } from '../components/ui';
import { decisionClass, pct, scoreLabel } from '../lib/format';
import type { GradeView, SkillDetail, SubmitArtifactPayload, SubmitSkillPayload } from '../types';
import { errorMessage, type CardProps } from './shared';

type Payload = SubmitSkillPayload | SubmitArtifactPayload;

function isSkillPayload(p: Payload): p is SubmitSkillPayload {
  return 'skill' in p && !('submission' in p);
}

export function GradeCard({ envelope, api, shell, sendMessage }: CardProps<Payload>) {
  const data = envelope.data;
  const grade: GradeView = data.grade;
  const skill: SkillDetail | undefined = isSkillPayload(data) ? data.skill : undefined;
  const artifact = isSkillPayload(data) ? undefined : data;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const tone = decisionClass(grade.decision);

  const requestPromotion = async () => {
    if (!skill) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await api<{ prNumber?: number | null; requiredApproverRoles?: string[] }>(`/skills/${skill.id}/promotion-requests`, { method: 'POST' });
      setNote(`Promotion requested${res.body?.prNumber ? ` (PR #${res.body.prNumber})` : ''}. Needs ${res.body?.requiredApproverRoles?.join(' + ') ?? 'champion'} approval.`);
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const revise = async () => {
    const msg = skill
      ? `Let's revise the skill "${skill.name}". Start with the lowest-scoring rubric item: ${lowest(grade)}.`
      : `Let's revise my submission for "${artifact?.exercise.title ?? 'this exercise'}". Start with: ${lowest(grade)}.`;
    const ok = sendMessage ? await sendMessage(msg) : false;
    setNote(ok ? 'Asked Claude to start the revision.' : `Say to Claude: “${msg}”`);
  };

  const title = skill ? `${skill.name} · v${skill.version}` : artifact?.exercise.title ?? 'Graded';
  const findings = (grade.securityFindings ?? []) as unknown[];

  return (
    <CardShell
      {...shell}
      eyebrow={skill ? 'Skill grade' : 'Exercise grade'}
      title={<span className="inline-flex items-center gap-2">{title} <DecisionPill decision={grade.decision} score={grade.score} /></span>}
      subtitle={artifact?.promotion ? <span style={{ color: 'var(--pass)' }}>Gate met — you moved to L{artifact.promotion.newRung}.</span> : undefined}
      webUrl={envelope.links.web}
      viewer={envelope.viewer}
      testId="card-grade"
    >
      <div className="grid sm:grid-cols-[1fr_auto]">
        <Section title="Rubric">
          <ul className="m-0 p-0 list-none flex flex-col gap-2">
            {grade.rubric.map((r) => (
              <li key={r.criterion} className="text-[12px]" data-testid="rubric-row">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{r.label}</span>
                  <span style={{ color: 'var(--fg-2)' }}>{scoreLabel(r.score)}</span>
                </div>
                <Meter value={r.score} tone={r.score >= 0.75 ? 'pass' : r.score >= 0.5 ? 'revise' : 'fail'} height={5} />
                {r.note ? <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--fg-2)' }}>{r.note}</div> : null}
              </li>
            ))}
          </ul>
        </Section>
        <div className="px-4 py-3 flex flex-col gap-2 sm:border-l sm:min-w-[170px]" style={{ borderColor: 'var(--line)' }}>
          <div className="tile"><div className="value" style={{ color: `var(--${tone})` }}>{scoreLabel(grade.score)}</div><div className="label">overall / 10</div></div>
          {grade.critiqueQuality !== null && grade.critiqueQuality !== undefined ? <div className="tile"><div className="value">{pct(grade.critiqueQuality)}</div><div className="label">critique quality</div></div> : null}
          {grade.expectationAccuracy !== null && grade.expectationAccuracy !== undefined ? <div className="tile"><div className="value">{pct(grade.expectationAccuracy)}</div><div className="label">expectation accuracy</div></div> : null}
        </div>
      </div>

      <div className="hairline" />
      <Section title="Feedback">
        <p className="m-0 text-[12.5px]">{grade.feedback}</p>
        {grade.teachingMoment ? (
          <div className="mt-2 p-2.5 rounded-lg text-[12px]" style={{ background: 'var(--glow-soft)', borderLeft: '3px solid var(--glow)' }}>
            <span className="eyebrow" style={{ color: 'inherit' }}>Teaching moment</span>
            <div className="mt-0.5">{grade.teachingMoment}</div>
          </div>
        ) : null}
        {findings.length > 0 ? (
          <div className="mt-2 flex flex-col gap-1" data-testid="security-findings">
            <span className="eyebrow" style={{ color: 'var(--fail)' }}>Security findings</span>
            {findings.map((f, i) => {
              const o = typeof f === 'string' ? { title: f } : (f as { severity?: string; title?: string; detail?: string });
              return (
                <div key={i} className="text-[12px] flex gap-2 items-start">
                  <Pill tone="fail">{o.severity ?? 'finding'}</Pill>
                  <span><span className="font-medium">{o.title}</span>{o.detail ? <span style={{ color: 'var(--fg-2)' }}> — {o.detail}</span> : null}</span>
                </div>
              );
            })}
          </div>
        ) : null}
        {artifact ? (
          <div className="mt-3 text-[11.5px] grid gap-1" style={{ color: 'var(--fg-2)' }}>
            <div><span className="font-medium">You expected:</span> {artifact.submission.expectationText} <span style={{ color: 'var(--fg-3)' }}>({pct(artifact.submission.expectationConfidence)} confident)</span></div>
            <div><span className="font-medium">You critiqued:</span> {artifact.submission.critiqueText}</div>
          </div>
        ) : null}
      </Section>

      <div className="hairline" />
      <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
        <button className="btn btn-sm" onClick={revise} data-testid="action-revise">Revise with Claude</button>
        {skill ? (
          <button className="btn btn-sm btn-primary" disabled={busy || tone !== 'pass'} onClick={requestPromotion} title={tone !== 'pass' ? 'Needs a passing grade first' : 'Open a promotion request (PR) for champion approval'} data-testid="action-request-promotion">
            {busy ? 'Requesting…' : 'Request promotion'}
          </button>
        ) : artifact?.nextUp ? (
          <span className="text-[12px]" style={{ color: 'var(--fg-2)' }}>Next up: <span className="font-medium">{artifact.nextUp.title}</span></span>
        ) : null}
        {note ? <span className="text-[11.5px] basis-full" style={{ color: 'var(--fg-2)' }}>{note}</span> : null}
      </div>
    </CardShell>
  );
}

function lowest(g: GradeView): string {
  const r = [...g.rubric].sort((a, b) => a.score - b.score)[0];
  return r ? `${r.label}${r.note ? ` (${r.note})` : ''}` : 'the feedback above';
}
