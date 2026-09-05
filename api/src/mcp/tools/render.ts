/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- REST payloads are rendered defensively as untyped JSON (three renderers, one payload) */
/**
 * Plain-text renderers: the third renderer of "three renderers, one payload". Every tool returns
 * this text in `content` so hosts without MCP Apps UI still get a useful answer. Pure functions
 * over the REST payloads described in docs/api-contract.md; defensive against partial payloads.
 */

export const RUNG_NAMES: Record<number, string> = {
  0: 'Orientation',
  1: 'Conversational',
  2: 'Context',
  3: 'Skill',
  4: 'Workflow',
  5: 'Champion',
};

type Obj = Record<string, any>;

export function rungLabel(rung: number | null | undefined): string {
  if (rung === null || rung === undefined) return 'unplaced';
  return `L${rung} ${RUNG_NAMES[rung] ?? ''}`.trim();
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  return `${Math.round(n * 100)}%`;
}

export function hours(minutes: number | null | undefined, digits = 1): string {
  if (minutes === null || minutes === undefined) return '–';
  return `${(minutes / 60).toFixed(digits)}h`;
}

function name(p: Obj | null | undefined): string {
  return p?.name ?? p?.email ?? 'unassigned';
}

function list(lines: string[]): string {
  return lines.filter(Boolean).join('\n');
}

export function renderLadder(d: Obj | null | undefined): string {
  if (!d) return 'No ladder yet: finish the intake interview to get placed.';
  const rung = d.rung as number | undefined;
  const next = d.nextRung as number | null | undefined;
  const head =
    next === null || next === undefined
      ? `You're ${rungLabel(rung)}, the top rung.`
      : `You're ${rungLabel(rung)}, ${pct(d.progress?.toNextRung)} to L${next}.`;
  const gates = d.progress?.met
    ? `Gate: ${Object.entries(d.progress.met as Record<string, boolean>)
        .map(([k, v]) => `${k} ${v ? 'met' : 'not yet'}`)
        .join(', ')}.`
    : '';
  const nextUp = d.nextUp
    ? `Next up: ${d.nextUp.title}${d.nextUp.estimatedMinutes ? ` (~${d.nextUp.estimatedMinutes} min)` : ''}${d.nextUp.brief ? ` — ${d.nextUp.brief}` : ''}`
    : 'Next up: nothing queued; Coach will assign one after your next submission.';
  const revisits = Array.isArray(d.revisitsDue) ? d.revisitsDue : [];
  const overdue = revisits.filter((r: Obj) => r.overdue).length;
  const revisitLine =
    revisits.length === 0
      ? 'No revisits due.'
      : `${revisits.length} revisit${revisits.length === 1 ? '' : 's'} due${overdue ? ` (${overdue} overdue)` : ''}: ${revisits
          .slice(0, 3)
          .map((r: Obj) => r.competencyName ?? r.competencyCode)
          .join(', ')}.`;
  const hb = d.hoursBack;
  const hoursLine = hb
    ? `${hours(hb.thisMonthMinutes)} back this month${hb.baselineMinutesPerWeek !== undefined ? ` vs a ${hours(hb.baselineMinutesPerWeek)}/week baseline` : ''}${
        hb.currentMinutesPerWeek !== undefined
          ? ` (now ${hours(hb.currentMinutesPerWeek)}/week)`
          : ''
      }.`
    : '';
  const judgement = d.judgement
    ? `Judgement ${pct(d.judgement.score)}, calibration ${pct(d.judgement.calibration)}, trend ${d.judgement.trend ?? 'flat'}.`
    : '';
  const streak = d.streak?.activeDays
    ? `Streak: ${d.streak.activeDays} active day${d.streak.activeDays === 1 ? '' : 's'}.`
    : '';
  const grades =
    Array.isArray(d.recentGrades) && d.recentGrades.length
      ? `Recent: ${d.recentGrades
          .slice(0, 3)
          .map((g: Obj) => `${g.exerciseTitle} ${pct(g.score)} ${g.decision}`)
          .join('; ')}.`
      : '';
  return list([
    head,
    gates,
    nextUp,
    revisitLine,
    hoursLine,
    judgement,
    streak,
    grades,
  ]);
}

export function renderSkillCard(s: Obj): string {
  const grade = s.grade
    ? `${pct(s.grade.score)} ${s.grade.decision}`
    : 'ungraded';
  const badge = s.boundaryBadge ? `boundary ${s.boundaryBadge}` : '';
  const meta = [
    `v${s.version ?? '?'}`,
    `${s.activeUsers30d ?? 0} active users/30d`,
    grade,
    badge,
    s.status,
  ]
    .filter(Boolean)
    .join(' · ');
  return `- ${s.name} (${s.slug}) — ${s.triggerLine ?? ''}\n  owner ${name(s.owner)}${s.team?.name ? `, ${s.team.name}` : ''} · ${meta}${s.adoptedByMe ? ' · adopted' : ''}`;
}

export function renderLibrary(
  d: Obj | null | undefined,
  filters: Obj = {},
): string {
  const skills: Obj[] = Array.isArray(d?.skills) ? d.skills : [];
  const applied = Object.entries(filters)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  if (skills.length === 0)
    return `No skills match${applied ? ` (${applied})` : ''}. Try a broader filter or browse the whole library.`;
  const head = `${skills.length} skill${skills.length === 1 ? '' : 's'}${applied ? ` (${applied})` : ''}:`;
  return list([
    head,
    ...skills.slice(0, 12).map(renderSkillCard),
    skills.length > 12 ? `…and ${skills.length - 12} more.` : '',
  ]);
}

export function renderSkillDetail(d: Obj | null | undefined): string {
  if (!d) return 'Skill not found.';
  const head = renderSkillCard(d);
  const boundary = d.boundary
    ? `Boundary: ${Object.entries(d.boundary as Obj)
        .filter(([, v]) => (Array.isArray(v) ? v.length : v))
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
        .join('; ')}`
    : 'Boundary: none declared.';
  const versions =
    Array.isArray(d.versions) && d.versions.length
      ? `Versions: ${d.versions
          .slice(0, 5)
          .map(
            (v: Obj) =>
              `v${v.version}${v.gradeScore !== undefined && v.gradeScore !== null ? ` (${pct(v.gradeScore)})` : ''}${v.author ? ` by ${name(v.author)}` : ''}`,
          )
          .join(', ')}`
      : '';
  const usage =
    Array.isArray(d.usageByTeam) && d.usageByTeam.length
      ? `Used by: ${d.usageByTeam.map((u: Obj) => `${u.teamName} ${u.activations30d}`).join(', ')} (activations/30d)`
      : 'No usage recorded in the last 30 days.';
  const promo = d.promotion
    ? `Promotion: ${d.promotion.decision ?? 'pending'}${d.promotion.prNumber ? ` (PR #${d.promotion.prNumber})` : ''}`
    : '';
  const md =
    typeof d.skillMd === 'string'
      ? `\n--- SKILL.md ---\n${d.skillMd.trim()}`
      : '';
  return list([head, boundary, versions, usage, promo]) + md;
}

export function renderGrade(
  g: Obj | null | undefined,
  heading = 'Grade',
): string {
  if (!g) return `${heading}: not graded yet.`;
  const head = `${heading}: ${pct(g.score)} — ${String(g.decision ?? '').toUpperCase()}`;
  const rubric =
    Array.isArray(g.rubric) && g.rubric.length
      ? g.rubric
          .map(
            (r: Obj) =>
              `  ${r.label ?? r.criterion}: ${pct(r.score)}${r.note ? ` — ${r.note}` : ''}`,
          )
          .join('\n')
      : '';
  const feedback = g.feedback ? `Feedback: ${g.feedback}` : '';
  const teach = g.teachingMoment ? `Teaching moment: ${g.teachingMoment}` : '';
  const sec =
    Array.isArray(g.securityFindings) && g.securityFindings.length
      ? `Security findings: ${g.securityFindings.map((f: Obj) => (typeof f === 'string' ? f : (f.title ?? f.detail ?? JSON.stringify(f)))).join('; ')}`
      : '';
  const judgement =
    g.critiqueQuality !== undefined || g.expectationAccuracy !== undefined
      ? `Critique quality ${pct(g.critiqueQuality)}, expectation accuracy ${pct(g.expectationAccuracy)}.`
      : '';
  return list([head, rubric, feedback, teach, sec, judgement]);
}

export function renderSubmitSkill(d: Obj | null | undefined): string {
  if (!d) return 'Submission failed: nothing was recorded.';
  const skill = d.skill ?? {};
  const head = `Submitted ${skill.name ?? skill.slug ?? 'skill'}${skill.version ? ` v${skill.version}` : ''} (${skill.status ?? 'draft'}).`;
  const grade = renderGrade(d.grade);
  const next =
    d.grade?.decision === 'pass'
      ? 'Passes the rubric. Say "request promotion" to open it for review, or keep iterating.'
      : d.grade?.decision === 'revise'
        ? 'Needs revision: address the feedback above and submit again.'
        : d.grade
          ? 'Did not pass. Rework the skill against the feedback and resubmit.'
          : '';
  return list([head, grade, next]);
}

export function renderSubmitArtifact(d: Obj | null | undefined): string {
  if (!d) return 'Submission failed: nothing was recorded.';
  const ex = d.exercise ?? {};
  const head = `Submitted ${ex.title ?? 'exercise'}${d.submission?.attempt ? ` (attempt ${d.submission.attempt})` : ''}.`;
  const grade = renderGrade(d.grade);
  const promo =
    d.promotion?.newRung !== undefined
      ? `Promoted to ${rungLabel(d.promotion.newRung)}!`
      : '';
  const next = d.nextUp
    ? `Next up: ${d.nextUp.title}${d.nextUp.estimatedMinutes ? ` (~${d.nextUp.estimatedMinutes} min)` : ''}.`
    : '';
  return list([head, grade, promo, next]);
}

export function renderInterview(d: Obj | null | undefined): string {
  if (!d) return 'No interview in progress.';
  const head = `Workflow interview (${d.mode ?? 'workflow'}, ${d.status ?? 'active'}): ${pct(d.completeness)} complete after ${d.turnCount ?? 0} turn${d.turnCount === 1 ? '' : 's'}.`;
  const scribe =
    d.scribe && typeof d.scribe === 'object'
      ? `Captured so far: ${
          Object.entries(d.scribe as Obj)
            .filter(
              ([, v]) =>
                v !== null &&
                v !== undefined &&
                v !== '' &&
                !(Array.isArray(v) && v.length === 0),
            )
            .map(
              ([k, v]) =>
                `${k}${Array.isArray(v) ? ` (${v.length})` : typeof v === 'string' ? `: ${v.length > 60 ? `${v.slice(0, 57)}…` : v}` : ''}`,
            )
            .join(', ') || 'nothing yet'
        }.`
      : '';
  const flags =
    Array.isArray(d.checkerFlags) && d.checkerFlags.length
      ? `Checker flags: ${d.checkerFlags.map((f: Obj) => (typeof f === 'string' ? f : (f.message ?? JSON.stringify(f)))).join('; ')}`
      : '';
  const done =
    (d.completeness ?? 0) >= 0.85
      ? 'Enough captured to finish: say "finish the interview" to write the workflow map.'
      : '';
  const q = d.nextQuestion ? `Next question: ${d.nextQuestion}` : '';
  return list([head, scribe, flags, done, q]);
}

export function renderTeam(d: Obj | null | undefined): string {
  if (!d) return 'No team found. Ask your admin to add you to a team.';
  const t = d.team ?? {};
  const s = d.stats ?? {};
  const head = `${t.name ?? 'Team'} — champion ${name(t.champion)}.`;
  const stats = `Active 7d ${pct(s.activePct7d)} · ${hours(s.hoursBackPerWeek ? s.hoursBackPerWeek * 60 : undefined)}/week back · ${s.skillsPublished ?? 0} skills published · ${
    s.promotionsPending ?? 0
  } promotions pending.`;
  const dist = Array.isArray(s.rungDistribution)
    ? `Rungs: ${s.rungDistribution.map((n: number, i: number) => `L${i}:${n}`).join(' ')}`
    : '';
  const roster: Obj[] = Array.isArray(d.roster) ? d.roster : [];
  const stalled = roster.filter((p) => p.stalled);
  const rosterLine = `${roster.length} people${stalled.length ? `; stalled: ${stalled.map((p) => `${name(p)} (${p.stalledDays}d)`).join(', ')}` : ''}.`;
  const backlog: Obj[] = Array.isArray(d.backlogTop)
    ? d.backlogTop.slice(0, 5)
    : [];
  const backlogLine = backlog.length
    ? `Backlog top ${backlog.length}: ${backlog.map((w) => `${w.name}${w.score?.composite !== undefined ? ` (${pct(w.score.composite)})` : ''}`).join('; ')}.`
    : 'Backlog is empty; run a champion interview to seed it.';
  const reviews: Obj[] = Array.isArray(d.reviewQueue) ? d.reviewQueue : [];
  const reviewLine = reviews.length
    ? `Review queue (${reviews.length}): ${reviews
        .slice(0, 5)
        .map((r) => `${name(r.person)} — ${r.exercise?.title ?? 'exercise'}`)
        .join('; ')}.`
    : 'Review queue is clear.';
  return list([head, stats, dist, rosterLine, backlogLine, reviewLine]);
}

export function renderOrg(d: Obj | null | undefined): string {
  if (!d) return 'No organisation data.';
  const org = d.org ?? {};
  const head = `${org.name ?? 'Organisation'}${org.seats ? ` — ${org.seats} seats` : ''}.`;
  const a = d.adoption?.active;
  const adoption = a
    ? `Adoption: ${pct(a.pctOfSeats)} of seats active${a.trend ? ` (${a.trend})` : ''}.`
    : 'Adoption: no analytics yet.';
  const people: Obj[] = Array.isArray(d.people?.people) ? d.people.people : [];
  const peopleLine = people.length
    ? `People: ${people.length} tracked, ${people.filter((p) => p.rising).length} rising, ${people.filter((p) => p.stalled).length} stalled, ${people.filter((p) => p.championCandidate).length} champion candidates.`
    : '';
  const groups: Obj[] = Array.isArray(d.groups?.groups) ? d.groups.groups : [];
  const groupsLine = groups.length
    ? `Groups: ${groups
        .slice(0, 6)
        .map(
          (g) =>
            `${g.teamName} ${pct(g.activePct)} active, ${g.skillsPublished ?? 0} skills`,
        )
        .join('; ')}.`
    : '';
  const c = d.cost;
  const cost = c?.seats
    ? `Cost: $${Math.round(c.seats.costPerActive ?? 0)}/active seat, ${c.seats.inactive ?? 0} inactive seats ($${Math.round(c.seats.costInactive ?? 0)}).${
        c.return?.roi !== undefined
          ? ` ROI ${Number(c.return.roi).toFixed(1)}x on ${Math.round(c.return.hoursBackPerMonth ?? 0)}h back/month.`
          : ''
      }`
    : '';
  return list([head, adoption, peopleLine, groupsLine, cost]);
}

export function renderPromotion(p: Obj): string {
  const s = p.skill ?? {};
  const approvals = Array.isArray(p.approvals) ? p.approvals.length : 0;
  const required = Array.isArray(p.requiredApproverRoles)
    ? p.requiredApproverRoles.join('+')
    : 'champion';
  const grade = p.grade
    ? `${pct(p.grade.score)} ${p.grade.decision}`
    : 'no grade';
  const boundary = p.boundaryCheck
    ? typeof p.boundaryCheck === 'string'
      ? p.boundaryCheck
      : p.boundaryCheck.ok === false || p.boundaryCheck.pass === false
        ? 'boundary FAIL'
        : 'boundary ok'
    : '';
  return `- ${s.name ?? s.slug ?? 'skill'} v${p.version ?? '?'} by ${name(p.requestedBy)}${p.prNumber ? ` (PR #${p.prNumber})` : ''} — ${grade}${boundary ? `, ${boundary}` : ''}${
    p.highExposure ? ', HIGH EXPOSURE' : ''
  }; ${approvals} approval${approvals === 1 ? '' : 's'}, needs ${required}; ${p.decision ?? 'pending'}${p.diffSummary ? `\n  ${String(p.diffSummary).split('\n')[0]}` : ''}`;
}

export function renderPromotionQueue(d: Obj | null | undefined): string {
  const items: Obj[] = Array.isArray(d?.promotions) ? d.promotions : [];
  const acted = d?.acted
    ? `${d.acted.skill?.name ?? 'Skill'} v${d.acted.version}: ${d.acted.decision ?? 'recorded'}.`
    : '';
  if (items.length === 0) return list([acted, 'Promotion queue is empty.']);
  return list([
    acted,
    `${items.length} pending promotion${items.length === 1 ? '' : 's'}:`,
    ...items.slice(0, 10).map(renderPromotion),
  ]);
}

export function renderError(
  tool: string,
  err: { status: number; title: string; detail: string },
): string {
  if (err.status === 401)
    return `Activate could not verify who you are (${err.detail}). Reconnect the Activate connector and try ${tool} again.`;
  if (err.status === 403)
    return `You do not have access to ${tool} (${err.detail}).`;
  if (err.status === 404) return `${tool}: ${err.detail}`;
  return `${tool} failed (${err.status} ${err.title}): ${err.detail}`;
}
