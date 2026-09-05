import { useState } from 'react';
import { CardShell } from '../components/CardShell';
import { Avatar, BoundaryDot, DecisionPill, Pill, Section, StateBlock } from '../components/ui';
import { shortDate } from '../lib/format';
import type { PromotionQueuePayload, PromotionView } from '../types';
import { errorMessage, type CardProps } from './shared';

export function PromotionQueueCard({ envelope, api, shell }: CardProps<PromotionQueuePayload>) {
  const [items, setItems] = useState<PromotionView[]>(envelope.data.promotions ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(envelope.data.acted?.id ?? envelope.data.promotions?.[0]?.id ?? null);
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState<'approve' | 'send-back' | null>(null);
  const [msg, setMsg] = useState<string | null>(envelope.data.acted ? `${envelope.data.acted.skill.name}: ${envelope.data.acted.decision.replace(/_/g, ' ')}.` : null);

  const selected = items.find((p) => p.id === selectedId) ?? null;

  const decide = async (action: 'approve' | 'send-back') => {
    if (!selected) return;
    if (action === 'send-back' && !noteText.trim()) { setMsg('A send-back needs a note so the author knows what to change.'); return; }
    setBusy(action);
    setMsg(null);
    try {
      const res = await api<PromotionView>(`/promotions/${selected.id}/${action}`, { method: 'POST', body: noteText.trim() ? { note: noteText.trim() } : {} });
      const updated = res.body;
      setItems((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setNoteText('');
      setMsg(action === 'approve'
        ? updated.decision === 'merged' ? `${updated.skill.name} v${updated.version} merged and published.` : `Approved. Still needs ${updated.requiredApproverRoles.filter((r) => !updated.approvals.some((a) => a.role === r)).join(' + ') || 'another approver'}.`
        : `${updated.skill.name} sent back to ${updated.requestedBy.name}.`);
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const pending = items.filter((p) => p.decision === 'pending');

  return (
    <CardShell
      {...shell}
      eyebrow="Promotion queue"
      title={<span>{pending.length} awaiting approval</span>}
      subtitle={items.length !== pending.length ? `${items.length - pending.length} decided this session` : undefined}
      webUrl={envelope.links.web}
      viewer={envelope.viewer}
      testId="card-promotion-queue"
    >
      {items.length === 0 ? (
        <StateBlock kind="done" title="Queue is clear" detail="No promotion requests are waiting. New ones appear here when a learner's skill passes the Grader and they request promotion." testId="card-empty" />
      ) : (
        <div className="grid sm:grid-cols-[220px_1fr]">
          <ul className="m-0 p-2 list-none flex flex-col gap-1 sm:border-r" style={{ borderColor: 'var(--line)' }} data-testid="promotion-list">
            {items.map((p) => (
              <li key={p.id}>
                <button
                  className="w-full text-left p-2 rounded-md text-[12px] flex flex-col gap-0.5"
                  style={{ background: p.id === selectedId ? 'var(--bg-2)' : 'transparent', border: `1px solid ${p.id === selectedId ? 'var(--glow)' : 'transparent'}`, cursor: 'pointer', font: 'inherit', color: 'inherit' }}
                  onClick={() => setSelectedId(p.id)}
                  data-testid="promotion-row"
                >
                  <span className="font-semibold truncate">{p.skill.name} <span style={{ color: 'var(--fg-3)', fontWeight: 400 }}>v{p.version}</span></span>
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <DecisionPill decision={p.decision === 'pending' ? p.grade?.decision : p.decision} score={p.decision === 'pending' ? p.grade?.score : undefined} />
                    <BoundaryDot badge={p.boundaryCheck && (p.boundaryCheck.ok ?? p.boundaryCheck.passed) === false ? 'red' : p.highExposure ? 'amber' : 'green'} />
                    {p.highExposure ? <Pill tone="revise">compliance</Pill> : null}
                  </span>
                  <span className="text-[11px]" style={{ color: 'var(--fg-3)' }}>{p.requestedBy.name} · {shortDate(p.createdAt)}{p.prNumber ? ` · PR #${p.prNumber}` : ''}</span>
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <div data-testid="promotion-detail">
              <Section title="What changed">
                <p className="m-0 text-[12.5px]">{selected.diffSummary ?? 'No diff summary recorded.'}</p>
                <div className="flex items-center gap-2 mt-2 text-[11.5px]" style={{ color: 'var(--fg-2)' }}>
                  <Avatar person={selected.requestedBy} size={20} />
                  <span>{selected.requestedBy.name} · branch <code className="text-[10.5px]">{selected.branch ?? '—'}</code></span>
                  {selected.prUrl ? <button className="link" onClick={() => shell.onOpenWeb(selected.prUrl!)}>PR #{selected.prNumber}</button> : null}
                  {selected.testResults ? <Pill tone={(selected.testResults.failed ?? 0) > 0 ? 'fail' : 'pass'}>{selected.testResults.passed ?? 0}/{selected.testResults.total ?? 0} cases pass</Pill> : null}
                </div>
              </Section>
              <div className="hairline" />
              <div className="grid sm:grid-cols-2">
                <Section title="Grade">
                  {selected.grade ? (
                    <div className="flex flex-col gap-1 text-[12px]">
                      <DecisionPill decision={selected.grade.decision} score={selected.grade.score} />
                      <div style={{ color: 'var(--fg-2)' }} className="line-clamp-4">{selected.grade.feedback}</div>
                      {(selected.grade.securityFindings as unknown[] | undefined)?.length ? <Pill tone="fail">{(selected.grade.securityFindings as unknown[]).length} security finding(s)</Pill> : null}
                    </div>
                  ) : <div className="text-[12px]" style={{ color: 'var(--fg-3)' }}>Not graded.</div>}
                </Section>
                <Section title="Boundary check">
                  {selected.boundaryCheck ? (
                    <div className="flex flex-col gap-1 text-[12px]">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`dot ${(selected.boundaryCheck.ok ?? selected.boundaryCheck.passed) === false ? 'dot-red' : 'dot-green'}`} />
                        {(selected.boundaryCheck.ok ?? selected.boundaryCheck.passed) === false ? 'Needs compliance approval' : 'Within org boundary'}
                      </span>
                      {(selected.boundaryCheck.findings ?? []).map((f, i) => <div key={i} style={{ color: 'var(--fail)' }}>{f}</div>)}
                      {selected.boundaryCheck.notes ? <div style={{ color: 'var(--fg-2)' }}>{selected.boundaryCheck.notes}</div> : null}
                    </div>
                  ) : <div className="text-[12px]" style={{ color: 'var(--fg-3)' }}>No boundary check recorded.</div>}
                  <div className="mt-2 text-[11.5px]" style={{ color: 'var(--fg-3)' }}>
                    Requires: {selected.requiredApproverRoles.join(' + ')}{selected.approvals.length ? ` · approved by ${selected.approvals.map((a) => a.person?.name ?? a.role).join(', ')}` : ''}
                  </div>
                </Section>
              </div>
              <div className="hairline" />
              <div className="px-4 py-3 flex flex-col gap-2">
                {selected.decision === 'pending' ? (
                  <>
                    <input className="input" placeholder="Note to the author (required for send back)" value={noteText} onChange={(e) => setNoteText(e.target.value)} disabled={busy !== null} data-testid="input-note" />
                    <div className="flex items-center gap-2">
                      <button className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => decide('approve')} data-testid="action-approve">{busy === 'approve' ? 'Approving…' : 'Approve'}</button>
                      <button className="btn btn-sm btn-danger" disabled={busy !== null} onClick={() => decide('send-back')} data-testid="action-send-back">{busy === 'send-back' ? 'Sending…' : 'Send back'}</button>
                    </div>
                  </>
                ) : (
                  <div className="text-[12px]"><DecisionPill decision={selected.decision} /> {selected.decidedAt ? <span style={{ color: 'var(--fg-3)' }}>{shortDate(selected.decidedAt)}</span> : null}</div>
                )}
                {msg ? <div className="text-[11.5px]" style={{ color: 'var(--fg-2)' }} data-testid="promotion-note">{msg}</div> : null}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </CardShell>
  );
}
