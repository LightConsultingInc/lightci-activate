import { CardShell } from '../components/CardShell';
import { Meter, Pill, Section, Tile } from '../components/ui';
import { num, pct, usd } from '../lib/format';
import type { OrgPayload } from '../types';
import type { CardProps } from './shared';

export function OrgCard({ envelope, shell }: CardProps<OrgPayload>) {
  const d = envelope.data;
  const seats = d.org?.seats ?? d.cost?.seats?.total ?? null;
  const activePct = d.adoption?.active?.pctOfSeats ?? (d.cost?.seats?.active && seats ? d.cost.seats.active / seats : null);
  const people = d.people?.people ?? [];
  const rising = people.filter((p) => p.rising).length;
  const stalled = people.filter((p) => p.stalled).length;
  const groups = d.groups?.groups ?? [];
  const missing = (['adoption', 'people', 'groups', 'cost'] as const).filter((k) => d[k] === null || d[k] === undefined);
  const hoursBack = d.cost?.return?.hoursBackPerMonth ?? (d.adoption?.byTeam ? d.adoption.byTeam.reduce((a, t) => a + (t.hoursBack ?? 0), 0) * 4.3 : null);

  return (
    <CardShell
      {...shell}
      eyebrow="Mission Control"
      title={d.org?.name ?? 'Your organisation'}
      subtitle={seats !== null ? <span>{seats} seats{d.org?.premiumSeats ? ` · ${d.org.premiumSeats} premium` : ''}</span> : undefined}
      webUrl={envelope.links.web}
      viewer={envelope.viewer}
      testId="card-org"
      actions={<button className="btn btn-sm btn-glow" onClick={() => shell.onOpenWeb(envelope.links.web)} data-testid="action-open-mc">Open Mission Control</button>}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-3">
        <Tile value={pct(activePct)} label="active on real work" hint={d.adoption?.active?.trend ? `trend ${d.adoption.active.trend}` : undefined} testId="tile-adoption" />
        <Tile value={hoursBack !== null ? `${num(hoursBack)}h` : '—'} label="hours back / month" testId="tile-hours" />
        <Tile value={<span>{rising}<span className="text-[12px] font-normal" style={{ color: 'var(--fg-3)' }}> ↑ / </span>{stalled}<span className="text-[12px] font-normal" style={{ color: 'var(--fg-3)' }}> stalled</span></span>} label="people rising / stalled" testId="tile-people" />
        <Tile value={d.cost?.seats?.costPerActive !== undefined ? usd(d.cost.seats.costPerActive) : groups.length} label={d.cost?.seats?.costPerActive !== undefined ? 'cost per active seat / mo' : 'groups in program'} testId="tile-cost" />
      </div>

      {d.adoption?.byTeam || groups.length ? (
        <>
          <div className="hairline" />
          <Section title="Groups" count={groups.length || d.adoption?.byTeam?.length}>
            <ul className="m-0 p-0 list-none flex flex-col gap-2 text-[12px]">
              {(groups.length ? groups.map((g) => ({ id: g.teamId, name: g.teamName, activePct: g.activePct, extra: `${g.size} people · ${g.skillsPublished} skills · ${num(g.hoursBackPerPerson)}h back / person` })) : (d.adoption?.byTeam ?? []).map((t) => ({ id: t.teamId, name: t.teamName, activePct: t.activePct, extra: `${num(t.hoursBack)}h back / wk` }))).map((g) => (
                <li key={g.id} data-testid="group-row">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium">{g.name}</span><span style={{ color: 'var(--fg-2)' }}>{pct(g.activePct)} active</span></div>
                  <Meter value={g.activePct} tone={g.activePct >= 0.6 ? 'pass' : g.activePct >= 0.4 ? 'revise' : 'fail'} height={5} />
                  <div className="text-[11px]" style={{ color: 'var(--fg-3)' }}>{g.extra}</div>
                </li>
              ))}
            </ul>
          </Section>
        </>
      ) : null}

      {d.cost ? (
        <>
          <div className="hairline" />
          <Section title="Cost and return">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Tile value={usd(d.cost.seats?.costTotal)} label="seat cost / mo" />
              <Tile value={<span style={{ color: 'var(--fail)' }}>{usd(d.cost.seats?.costInactive)}</span>} label={`${d.cost.seats?.inactive ?? '—'} inactive seats`} />
              <Tile value={d.cost.return?.roi !== undefined ? `${num(d.cost.return.roi)}×` : usd(d.cost.return?.valueUsd)} label={d.cost.return?.roi !== undefined ? 'return on program' : 'value of hours back'} />
            </div>
            {d.cost.waste && d.cost.waste.length ? (
              <div className="flex flex-wrap gap-1 mt-2">{d.cost.waste.map((w) => <Pill key={w.kind} tone="revise">{w.kind.replace(/_/g, ' ')} · {w.count} · {usd(w.costUsd)}</Pill>)}</div>
            ) : null}
          </Section>
        </>
      ) : null}

      {missing.length ? (
        <div className="px-4 pb-3 text-[11.5px]" style={{ color: 'var(--fg-3)' }} data-testid="org-partial">
          Couldn't load {missing.join(', ')} right now; the rest is current. Open Mission Control for the full view.
        </div>
      ) : null}
    </CardShell>
  );
}
