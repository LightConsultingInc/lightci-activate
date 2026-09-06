import { useState } from 'react';
import { CardShell } from '../components/CardShell';
import { Meter, Pill, Section } from '../components/ui';
import { pct, titleCase } from '../lib/format';
import type { InterviewView } from '../types';
import { errorMessage, type CardProps } from './shared';

const HIDDEN_KEYS = new Set(['id', 'version']);

function filled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
}

function show(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' && x ? JSON.stringify(x) : String(x))).join(', ');
  if (typeof v === 'object' && v) return JSON.stringify(v);
  return String(v);
}

export function ScribeCard({ envelope, api, shell }: CardProps<InterviewView>) {
  const [iv, setIv] = useState<InterviewView>(envelope.data);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState<'turn' | 'complete' | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const send = async () => {
    if (!answer.trim()) return;
    setBusy('turn');
    setNote(null);
    try {
      const res = await api<InterviewView>(`/interviews/${iv.id}/turns`, { method: 'POST', body: { content: answer.trim() } });
      setIv(res.body);
      setAnswer('');
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const complete = async () => {
    setBusy('complete');
    setNote(null);
    try {
      const res = await api<{ interview: InterviewView; workflowMapIds?: string[] }>(`/interviews/${iv.id}/complete`, { method: 'POST' });
      setIv(res.body.interview ?? { ...iv, status: 'complete' });
      setNote(`Workflow map saved${res.body.workflowMapIds?.length ? ` (${res.body.workflowMapIds.length} map${res.body.workflowMapIds.length === 1 ? '' : 's'})` : ''}. Scorer will rank it in the backlog.`);
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const fields = Object.entries(iv.scribe ?? {}).filter(([k]) => !HIDDEN_KEYS.has(k));
  const done = fields.filter(([, v]) => filled(v)).length;
  const finished = iv.status === 'complete' || iv.status === 'completed';
  const tail = iv.transcript.slice(-3);
  const flags = (iv.checkerFlags ?? []) as unknown[];

  return (
    <CardShell
      {...shell}
      eyebrow={`Interviewer · ${iv.mode}`}
      title={<span>{String(iv.scribe?.name ?? (iv.mode === 'intake' ? 'Your intake' : 'Mapping a workflow'))}</span>}
      subtitle={<span>{pct(iv.completeness)} complete · {iv.turnCount} turns{finished ? ' · finished' : ''}</span>}
      webUrl={envelope.links.web}
      viewer={envelope.viewer}
      testId="card-scribe"
    >
      <div className="px-4 pt-3">
        <Meter value={iv.completeness} tone={iv.completeness >= 0.85 ? 'pass' : 'glow'} />
        <div className="flex justify-between text-[11px] mt-1" style={{ color: 'var(--fg-3)' }}>
          <span>{done} of {fields.length} fields captured</span>
          <span>{iv.completeness >= 0.85 ? 'Ready to finish' : `Finish unlocks at 85%`}</span>
        </div>
      </div>

      <div className="grid sm:grid-cols-[1fr_1fr]">
        <Section title="Scribe">
          <ul className="m-0 p-0 list-none flex flex-col gap-1 text-[12px]" data-testid="scribe-fields">
            {fields.map(([k, v]) => {
              const ok = filled(v);
              return (
                <li key={k} className="flex items-start gap-2" data-filled={ok}>
                  <span className="shrink-0 mt-[1px]" style={{ color: ok ? 'var(--pass)' : 'var(--fg-3)', width: 12 }} aria-label={ok ? 'captured' : 'pending'}>{ok ? '✓' : '○'}</span>
                  <span className="min-w-0">
                    <span className="font-medium">{titleCase(k)}</span>
                    {ok ? <span style={{ color: 'var(--fg-2)' }}>: {show(v).length > 90 ? `${show(v).slice(0, 90)}…` : show(v)}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
          {flags.length > 0 ? (
            <div className="mt-2 flex flex-col gap-1">
              {flags.map((f, i) => {
                const o = typeof f === 'string' ? { message: f } : (f as { field?: string; issue?: string; message?: string });
                return <div key={i} className="text-[11.5px] flex gap-1.5 items-start"><Pill tone="revise">check</Pill><span style={{ color: 'var(--fg-2)' }}>{o.field ? `${titleCase(o.field)}: ` : ''}{o.issue ?? o.message ?? ''}</span></div>;
              })}
            </div>
          ) : null}
        </Section>

        <Section title="Conversation">
          <div className="flex flex-col gap-1.5 text-[12px] max-h-[180px] overflow-y-auto">
            {tail.map((t, i) => (
              <div key={i} className="p-2 rounded-md" style={{ background: t.role === 'user' ? 'var(--bg-2)' : 'var(--glow-soft)', border: '1px solid var(--line)' }}>
                <span className="eyebrow" style={{ fontSize: 9.5 }}>{t.role === 'user' ? 'You' : 'Interviewer'}</span>
                <div>{t.content}</div>
              </div>
            ))}
          </div>
          {!finished ? (
            <div className="mt-2 flex flex-col gap-1.5">
              <div className="text-[12px] font-medium" data-testid="next-question">{iv.nextQuestion}</div>
              <textarea className="textarea" placeholder="Answer here, or just answer Claude in the chat." value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={busy !== null} data-testid="input-answer" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send(); }} />
              <div className="flex items-center gap-2">
                <button className="btn btn-sm btn-primary" disabled={busy !== null || !answer.trim()} onClick={send} data-testid="action-send-turn">{busy === 'turn' ? 'Sending…' : 'Send answer'}</button>
                <button className="btn btn-sm" disabled={busy !== null || iv.completeness < 0.85} onClick={complete} title={iv.completeness < 0.85 ? 'Keep going until the map is 85% complete' : 'Save the workflow map'} data-testid="action-complete">{busy === 'complete' ? 'Saving…' : 'Finish'}</button>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-[12px]" style={{ color: 'var(--pass)' }}>Interview complete.</div>
          )}
          {note ? <div className="text-[11.5px] mt-1.5" style={{ color: 'var(--fg-2)' }}>{note}</div> : null}
        </Section>
      </div>
    </CardShell>
  );
}
