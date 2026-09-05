import { useState } from 'react';
import { CardShell } from '../components/CardShell';
import { Avatar, BoundaryDot, DecisionPill, Pill, Section } from '../components/ui';
import { Markdown } from '../lib/markdown';
import { shortDate } from '../lib/format';
import type { SkillDetail } from '../types';
import { errorMessage, type CardProps } from './shared';

export function SkillDetailCard({ envelope, api, shell }: CardProps<SkillDetail>) {
  const [skill, setSkill] = useState<SkillDetail>(envelope.data);
  const [tab, setTab] = useState<'skill' | 'boundary' | 'versions' | 'usage'>('skill');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const act = async (action: 'adopt' | 'fork') => {
    setBusy(action);
    setNote(null);
    try {
      const res = await api<SkillDetail | { slug?: string }>(`/skills/${skill.id}/${action}`, { method: 'POST' });
      if (action === 'adopt') {
        const fresh = await api<SkillDetail>(`/skills/${skill.slug}`);
        setSkill(fresh.body);
        setNote('Adopted. Coach queued an "adopt this skill on your case" exercise.');
      } else {
        const slug = (res.body as { slug?: string }).slug;
        setNote(`Forked as a draft${slug ? ` (${slug})` : ''}. Edit it with Claude, then say "submit" to grade it.`);
      }
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const maxUsage = Math.max(1, ...skill.usageByTeam.map((u) => u.activations30d));
  const b = skill.boundary ?? {};
  const boundaryRows: [string, unknown][] = [
    ['Allowed data', b.allowedDataClasses],
    ['Must never receive', b.mustNeverReceive],
    ['Read-only systems', b.readOnlySystems],
    ['Human review', b.humanReview],
  ];

  return (
    <CardShell
      {...shell}
      eyebrow={`Skill · ${skill.plugin ?? skill.team?.name ?? 'library'}`}
      title={skill.name}
      subtitle={<span className="inline-flex items-center gap-2 flex-wrap">v{skill.version} · {skill.status} · <DecisionPill decision={skill.grade?.decision} score={skill.grade?.score} /> <BoundaryDot badge={skill.boundaryBadge} withLabel /></span>}
      webUrl={envelope.links.web}
      viewer={envelope.viewer}
      testId="card-skill-detail"
    >
      <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[12px] flex items-center gap-2 min-w-0" style={{ color: 'var(--fg-2)' }}>
          <Avatar person={skill.owner} size={22} />
          <span className="truncate">{skill.owner ? `${skill.owner.name} owns this` : 'No owner — adopt or fork to take it on'} · {skill.activeUsers30d} active · {skill.runs30d ?? 0} runs / 30d</span>
        </div>
        <div className="flex gap-1.5">
          <button className="btn btn-sm btn-primary" disabled={busy !== null || skill.adoptedByMe || skill.status !== 'published'} onClick={() => act('adopt')} data-testid="action-adopt">
            {skill.adoptedByMe ? 'Adopted' : busy === 'adopt' ? 'Adopting…' : 'Adopt'}
          </button>
          <button className="btn btn-sm" disabled={busy !== null} onClick={() => act('fork')} data-testid="action-fork">{busy === 'fork' ? 'Forking…' : 'Fork'}</button>
        </div>
      </div>
      {note ? <div className="px-4 pb-2 text-[11.5px]" style={{ color: 'var(--fg-2)' }}>{note}</div> : null}
      <p className="m-0 px-4 pb-3 text-[12px] italic" style={{ color: 'var(--fg-2)' }}>“{skill.triggerLine}”</p>

      <div className="hairline" />
      <div className="flex gap-1 px-4 pt-2">
        {(['skill', 'boundary', 'versions', 'usage'] as const).map((t) => (
          <button key={t} className={`btn btn-sm ${tab === t ? '' : 'btn-ghost'}`} style={tab === t ? { borderColor: 'var(--glow)' } : undefined} onClick={() => setTab(t)} data-testid={`tab-${t}`}>
            {t === 'skill' ? 'SKILL.md' : t === 'boundary' ? 'Boundary' : t === 'versions' ? `Versions (${skill.versions.length})` : 'Usage'}
          </button>
        ))}
      </div>

      {tab === 'skill' ? (
        <div className="px-4 py-3 text-[12.5px] max-h-[420px] overflow-y-auto" data-testid="skill-md">
          <Markdown source={skill.skillMd} />
        </div>
      ) : null}

      {tab === 'boundary' ? (
        <Section title="Boundary declaration">
          <dl className="m-0 grid gap-2 text-[12px]" style={{ gridTemplateColumns: 'max-content 1fr' }}>
            {boundaryRows.map(([label, val]) => (
              <div key={label} className="contents">
                <dt className="font-medium" style={{ color: 'var(--fg-2)' }}>{label}</dt>
                <dd className="m-0 flex flex-wrap gap-1">
                  {Array.isArray(val) && val.length > 0 ? val.map((v) => <Pill key={String(v)} tone={label === 'Must never receive' ? 'fail' : label === 'Human review' ? 'revise' : 'neutral'}>{String(v)}</Pill>) : <span style={{ color: 'var(--fg-3)' }}>none declared</span>}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}

      {tab === 'versions' ? (
        <Section title="Version timeline">
          {skill.versions.length === 0 ? <div className="text-[12px]" style={{ color: 'var(--fg-3)' }}>Not yet promoted. The first approved promotion becomes v1.</div> : (
            <ol className="m-0 p-0 list-none relative" style={{ borderLeft: '1px solid var(--line)', marginLeft: 6 }}>
              {skill.versions.map((v) => (
                <li key={v.id} className="relative pl-4 pb-3 text-[12px]">
                  <span className="dot absolute" style={{ left: -4.5, top: 5, background: 'var(--glow)' }} />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">v{v.version}</span>
                    {v.tag ? <code className="text-[10.5px]" style={{ color: 'var(--fg-3)' }}>{v.tag}</code> : null}
                    <span style={{ color: 'var(--fg-3)' }}>{shortDate(v.createdAt)}</span>
                    {v.gradeScore !== null && v.gradeScore !== undefined ? <DecisionPill decision={v.gradeScore >= 0.7 ? 'pass' : 'revise'} score={v.gradeScore} /> : null}
                  </div>
                  {v.changelog ? <div style={{ color: 'var(--fg-2)' }}>{v.changelog}</div> : null}
                  <div className="text-[11px]" style={{ color: 'var(--fg-3)' }}>
                    {v.author ? `by ${v.author.name}` : ''}{v.approvers && v.approvers.length ? ` · approved by ${v.approvers.map((a) => a.name).join(', ')}` : ''}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Section>
      ) : null}

      {tab === 'usage' ? (
        <Section title="Activations by team · 30d">
          {skill.usageByTeam.length === 0 ? <div className="text-[12px]" style={{ color: 'var(--fg-3)' }}>No activations recorded in the last 30 days.</div> : (
            <ul className="m-0 p-0 list-none flex flex-col gap-2">
              {skill.usageByTeam.map((u) => (
                <li key={u.teamId} className="text-[12px]">
                  <div className="flex justify-between"><span>{u.teamName}</span><span style={{ color: 'var(--fg-2)' }}>{u.activations30d}</span></div>
                  <span className="meter" style={{ height: 5 }}><span style={{ width: `${(u.activations30d / maxUsage) * 100}%` }} /></span>
                </li>
              ))}
            </ul>
          )}
          {skill.adopters && skill.adopters.length ? (
            <div className="mt-3 flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--fg-2)' }}>
              {skill.adopters.slice(0, 6).map((a) => <Avatar key={a.id} person={a} size={20} />)}
              <span>{skill.adopters.length} adopter{skill.adopters.length === 1 ? '' : 's'}</span>
            </div>
          ) : null}
        </Section>
      ) : null}
    </CardShell>
  );
}
