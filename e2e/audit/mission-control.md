# Mission Control audit — numbers, not just rendering

Date: 2026-09-06 (UTC evening). Org: Meridian Wealth Partners (`f6c0e4cd-…`). Viewer: Elena Marsh (sponsor + admin).
Method: for every tab, compute the expected figure in SQL against Postgres (`docker exec lightci-activate psql`), compare to the `GET /api/mc/*` payload, then compare to the rendered DOM with a throwaway Playwright spec (deleted after the run) that fetched the same payload and asserted tile/row text.

**Caveat — moving target.** Another session was running e2e suites and editing the same repo/DB during this audit (skills 10→17, workflows 12→13, policy v1→v3, a compliance key added then removed, a person added, the API restarted at 21:59 from `dist/`). SQL↔API rows below are from the 20:48–20:55 snapshot; where a table changed I re-ran the SQL at 22:05 and note both. UI↔API checks ran at 22:00–22:05 against the live API, so they reflect the mutated data and the backend fixes (which the restart picked up).

Legend: ✅ match · ⚠ matches but misleading/labelling · ❌ defect. "Fixed" names the file.

## 1. Adoption (`/mission-control`)

| Metric | Expected (SQL) | API | UI | Verdict |
|---|---|---|---|---|
| Daily active-on-real-work series length (30d) | 30 rows 2026-08-08…09-06 | `active.daily` 30 points | chart renders 30 points | ✅ |
| Daily values, 3 sample days | 08-08 = 5, 08-24 = 17, 09-06 = 9 (`count(distinct personId) where metrics->>'activeOnRealWork'`) | 5 / 17 / 9 | sparkline + chart | ✅ |
| WAU (trailing 7d distinct) | 16 | `pctOfSeats` = 16/48 = 0.333; last ISO-week bucket (08-31) = 16 | "33% of 48 seats"; WAU tile 16 | ✅ (tile = ISO-week bucket, equals trailing 7d today) |
| MAU (trailing 30d distinct) | 17 | `monthly` last bucket (Sep month-to-date) = 16; trailing-30 not exposed | MAU tile 16 | ⚠ tile shows calendar-month-to-date (16), not trailing 30d (17). Per contract deviation, but the label "MAU" over-promises early in a month. Open, low. |
| % of seats | 16 / `orgs.seats`=48 = 33.3% | 0.333 | 33% | ✅ |
| Trend | last two complete ISO weeks 17→16 = −5.9% → down | `down` | "▼ Falling · last complete week vs the one before" | ✅ (label was "vs prior 30 days" — **fixed** `adoption-view.tsx`) |
| Sessions / active | 429 sessions ÷ 17 active = 25.2 | 25.2 | 25.2 "over the last 30d" | ✅ (sub said "per week" — **fixed** `adoption-view.tsx`) |
| Depth: connectors / skills activated / surfaces | 90 / 508 / chat 17, projects 17, code 3, cowork 3 | same | same | ✅ |
| Funnel | provisioned 18, logged_in 18, first_real_work 18, L1 15, L2 11, L3 6, L4 3, L5 1 (`max(rung) >= r` per person) | same | 8 steps, same counts | ✅ (note: "provisioned" counts people rows, not the 48 seats — ⚠ open, low) |
| By-team active % | CSO 4/5 = 0.80, FP 5/6 = 0.833, WA 6/6 = 1.0 | same | 80% / 83% / 100% | ✅ |
| By-team hours back / wk | CSO 210 min = 3.5h, FP 800 = 13.33h, WA 305 = 5.08h (latest measurement per baseline, net of rework) | 3.5 / 13.3 / 5.1 | 3.5h / 13.3h / 5.1h | ✅ (grey-out keyed on non-existent field — **fixed** to `hasBaseline`, `adoption-view.tsx`) |
| Inactive seats | Owen Castellano, last active 49 days ago | 1 row, 49 | 1 row "49" | ✅ |
| Team filter (`?teamId=CSO`) | seats = 5 members | pct 0.8, funnel 5/5/5/5/4/2/1/0 | — | ✅ |

## 2. People

| Metric | Expected (SQL) | API | UI | Verdict |
|---|---|---|---|---|
| Ranking rows | 18 people incl. sponsor Elena (no learner role, L0) | 18 rows; Elena ranked last at 0.167 | 18 rows | ❌ sponsor ranked as a learner — **fixed** `mission-control.service.ts` (`learners()` filter). Live after restart: SQL 17 = API 17 = UI 17 |
| Rung = latest placement | e.g. Sofia 4, Daniel 5, Owen 0 | same | RungBadge same | ✅ |
| Hours back / wk (per person) | Amara 2.50, Jonas −0.67, Tom 1.67, Grace 1.50, Hannah 4.75, Priya 7.08, Kevin −0.42, Marcus 0.42, Nathan 1.75, Sofia 3.33 | 2.5, −0.7, 1.7, 1.5, 4.8, 7.1, −0.4, 0.4, 1.8, 3.3 | Sofia row "3.3h" | ✅ (unmeasured rows now grey via `hasBaseline` — **fixed** `people-view.tsx`) |
| Skills published / adopted-by-others | Sofia 2/8, Daniel 1/5, Amara 1/3, Hannah 1/2, Tom 1/2 (`skills.ownerPersonId`, `skill_adoptions` by other people) | same | Sofia "3 / 8" at 22:00 (a skill was published concurrently) | ✅ |
| Grade quality | mean(grades.score): Sofia 0.855, Elena null | 0.855; Elena 0 with `hasGrades:false` | "86%"; Elena rendered "0%" | ❌ never-graded shown as 0% — **fixed** to "—" (`people-view.tsx`) |
| Active days / 30 | Sofia 28, Owen 0 | same | 28 | ✅ |
| Rising | should be people who passed a rung in 30d | Tom, Amara, Jonas, Victor — all first (diagnostic) placements on 08-24, incl. inactive Victor | 4 shown | ❌ diagnostic placements counted as gains; inactive seat "rising" — **fixed** `metrics.service.ts rungGains` (+ unit test) and inactive filter in `mission-control.service.ts`. Live: Sofia, Daniel, Hannah, Nathan, Grace, Kevin = SQL set |
| Stalled | rule: no rung pass ≥10d AND (no submission ≥10d OR activity −50%) | Sofia, Nathan, Isabelle, Rajesh (blocked), Laura (tool issue) | 5 | ✅ sensible (5 of 17) |
| Champion candidates | influence ≥0.5 rel, grade ≥0.8, rung <5 | Sofia | 1 | ✅ |
| Column sorting (UI) | — | — | rung, hoursBack, skillsPublished, influence, gradeQuality, activeDays ordered correctly both directions; person and score toggle `data-sort` | ✅ |

## 3. Journey

| Metric | Expected (SQL) | API | UI | Verdict |
|---|---|---|---|---|
| Heatmap counts sum to team size | CSO [0,1,2,1,1,0]=5, FP [1,1,2,1,0,1]=6, WA [1,2,1,1,1,0]=6 | same | `data-count` per cell identical; "People" column 5/6/6 | ✅ |
| Cohorts by `cohortWeek` (ISO Monday) | 06-29:[2,0,1,2,1,1], 07-06:[0,1,1,0,0,0], 07-13, 07-20, 07-27, 08-17:[0,2,2,1,1,0] | same 6 cohorts, no `unknown` | 6 rows, labels "Week of Jun 29 … Aug 17" | ✅ (label parsed with `new Date("YYYY-MM-DD")` → off-by-one west of UTC — **fixed** `parseISO`, `journey-view.tsx`; sponsor removed from cohorts — **fixed** backend) |
| Time in rung medians | L0 dwell {63.4, 63.4, 35.4} → median 63.4, p90 63.4; L1 {12.4…55.4} → 28 / 55.4 | same | "63d / 63d", "28d / 55d" | ✅ plausible |
| Stuck (>45d at rung) | Elena (sponsor), Owen at L0; Rajesh at L1 | same | listed | ❌ sponsor listed as stuck learner — **fixed** (learners filter). Live: Owen, Rajesh only |
| Revisit compliance due/done | CSO 1/0, FP 12/6, WA 3/1 (`dueAt <= now`) | same | same | ✅ |

## 4. Groups

| Metric | Expected (SQL) | API | UI | Verdict |
|---|---|---|---|---|
| Rows / size / active % | 3 teams, 5/6/6, 0.8/0.833/1.0 | same | "5 people", 80% … | ✅ |
| Rung mix sums to size | as heatmap | same | `rung-mix` title "L0: 0 · L1: 1 …" sums match | ✅ |
| Hours back / person | 3.5/5 = 0.70, 13.33/6 = 2.22, 5.08/6 = 0.85 | 0.7 / 2.22 / 0.85 | 0.7h / 2.2h / 0.8h | ✅ |
| Skills published / adopted | 2/5, 2/8, 2/7 (22:05: 3/5, 4/9, 3/7) | same at both times | "3 / 5" etc. | ✅ |
| Promotion throughput | merged & decided in 30d: 1/1/1 (22:05: 1/3/1) | same | shown as "1.00" under "Promotions / wk" | ❌ mislabelled (it is a 30-day count) — **fixed** header "Promotions (30d)" (`groups-view.tsx`) |
| Rework rate = revise/pass (30d grades) | 2/24 = 0.083, 1/10 = 0.1, 1/12 = 0.083 (22:05: 0.083, 2/13 = 0.154, 3/12 = 0.25) | same | 8% / 15% / 25% | ✅ |
| Champion queue age | pending: FP 5.3d, WA 8.3d, CSO none → 0 | same | 5.3d / 8.3d / 0.0d | ✅ |
| Compare `?a=&b=` | both groups + `programWeeks` + `normalised` | returns `{a, b}` with normalised block | card ignored `normalised`, recomputed raw and again said "Promotions / wk" | ❌ — **fixed** card uses server `normalised` (per person / per program week) (`groups-view.tsx`, `types.ts`) |

## 5. Skills health

| Metric | Expected (SQL / `shape.ts` rules) | API | UI | Verdict |
|---|---|---|---|---|
| Flags, 3 skills | CRM note cleanup: latest grade 0.76 < 0.8 → `grade_below_threshold`; RMD letter draft: in_review + pending PR → `pending_review`; Fee-change client letter: same → `pending_review`. All 6 published have runs>0 (no `unused_30d`), all owners active (no `owner_left`), no duplicate trigger lines, no red boundary | exactly those flags | badges match | ✅ |
| Library size tile | 10 non-deprecated skills (6 published, 2 draft, 2 in_review) | `health` returned only the 3 flagged cards | tile "Skills in library: 3 · 0 healthy" | ❌ — **fixed** API returns every card (`mission-control.service.ts`, contract shape) and UI sizes from `byTeam.skills` as fallback (`skills-view.tsx`). Live: 17 = 17 = UI 17, "4 healthy · 13 flagged" |
| Most used (runs 30d) | Client follow-up 225/6 users, Advisor prep 158/5, Proposal 41/4, CRM 41/4, Annual deck 15/3 (`sum(activations)`, `count(distinct personId)`) | same | rows match | ✅ |
| Least used | Onboarding packet QA 5/3 lowest | same reversed | rows match | ✅ |
| By team | FP 3 skills/173, WA 4/266, CSO 3/46 | same | same | ✅ |
| Unowned (owner null or inactive) | none | `[]` | "Every skill has an owner." | ✅ |
| Re-grade queue | Proposal (last regraded 08-05 > 30d), CRM (score < 0.8) | same | 2 items | ✅ |

## 6. Governance

| Metric | Expected | API | UI | Verdict |
|---|---|---|---|---|
| Policy / boundary version | `orgs.settings` had no `policyVersion`; audit_log has `policy.updated` 07-28, `boundary.updated` 07-18 | v1 / v1, `updatedAt: null` | "Version 1" no date | ⚠ — **fixed** fallback to audit-log count/date when settings lack stamps (`mission-control.service.ts`). Not exercisable live now: concurrent session stamped settings (v3 / v5), API = settings = UI |
| Promotion log | `audit_log` `promotion.*` = 7 (3 approved, 3 merged, 1 sent_back); `promotion_requests` 6 | 7 rows with skill, version, approver, grade | 7 rows | ✅ (22:05: 13 = 13 = 13). Duplicate React keys for approved+merged at same timestamp — **fixed** key includes decision (`governance-view.tsx`) |
| Drift table | `skill_assignments` 4 rows; `cso-operations` intended auto / observed available | 4 rows, 1 drift | 4 rows, 1 "Drift" badge; observed "auto" rendered blank | ❌ `MODE_LABEL` lacked `auto` — fixed in `governance-view.tsx` (applied concurrently by the other session; verified live: every Intended/Observed cell non-empty) |
| Events | audit_log last 30d = 11 (then 15, then 58) | equal at each fetch | `gov-event` count = min(50, events) | ✅ |
| Compliance feed honesty | no key → `configured:false, "no compliance key"`; mid-audit a key with wrong scopes → `configured:true, source:'audit_log', detail:"Missing required scopes…"` | honest at API level | UI keyed on `configured` only: would have claimed "Claude Compliance API" while showing audit-log rows | ❌ — **fixed** UI keys on `source === 'compliance_api'`, shows the `detail` banner (`governance-view.tsx`). Live at test time: key removed → "Not configured" panel shown ✅ |
| Audit export | — | `GET /mc/governance/export` 16 rows (7 promotion + 9 events), later 70 | button downloads `activate-audit-meridian-2026-09-06.json` with policy, boundary, promotionLog (same length as API), drift, events | ✅ (note: UI exports the governance payload client-side, not `exportUrl`; both are JSON) |

## 7. Backlog

| Metric | Expected (SQL) | API | UI | Verdict |
|---|---|---|---|---|
| Items = `workflow_maps` ordered by `score.composite` desc | 12 rows (22:05: 13) | 12 in order 84>83>78>51>46>30>20>17>11>9>8>null | 12/13 rows in same order | ✅ |
| Hours at stake | `score.hours` per row: 10+12+9+8+10+6+4+3+2.5+3+3 = 70.5 (schema has no minutesPerRun/runsPerWeek; Scorer stores hours) | `totals.hoursAtStake` 70.5 | tile "71h"; rows showed `baselineMinutesPerWeek/60` (e.g. 6.3h for a 10h item) because the UI read `score.hoursAtStake` not `score.hours`; IPS (no baseline) showed "0.0h" | ❌ — **fixed** `normalise.scoreField` reads `hours`; "no baseline" when `hasBaseline=false` (`backlog-view.tsx`). Live: row sum 70.5 = tile |
| Candidates / in build / shipped / next wave | 3 / 3 / 6 / 4 | same | same | ✅ |
| By team | WA 23.5, FP 28, CSO 19 (sum 70.5) | same | same | ✅ |
| SOW CSV rows | API filters to candidate/scored/next-wave items: 4 (22:05: 5) | `sowExport.rows` 4 | CSV 4 data rows (+header) | ✅ rows = SOW set, not all items (by design) |

## 8. Cost & Return

Inputs (`cost_inputs`): seat $60, premium $200, loaded $145/h, fees $25,000, champion 24 h/mo.

| Metric | Hand recomputation | API | UI | Verdict |
|---|---|---|---|---|
| Seats | total = max(48 org seats, 17 non-inactive people) = 48; active (30d) = 16; inactive 32; cost 48×60 = $2,880; inactive 32×60 = $1,920; per active 2880/16 = $180 | same | "$180 · 16 of 48 seats active (30d)" | ✅ |
| Premium | seats = max(6, 5 flagged) = 6; unused = 0 inactive premium + (6−5) = 1; cost $1,200; unused $200 | same | "1 of 6 · $200" | ✅ |
| Program | fees 25,000 + champion 24×145 = 3,480 + learner exercise 0 (no completions this month) = 28,480; **total** = 28,480 + 2,880 + 1,200 = $32,560 | same | "$32,560" | ✅ |
| Return | org minutes back 1,315/wk (12 baselines, latest measurement each) = 21.92 h/wk × 52/12 = 94.97 h/mo × $145 = $13,770.97 | 95 h, $13,770.97 | "$13,771 · 95h back × $145/h" | ✅ |
| ROI | (13,770.97 − 32,560) / 32,560 = −0.577 | −0.577 | "−58%" | ✅ |
| Per team | CSO 210 min → 15.2h/$2,199; FP 800 → 57.8h/$8,378; WA 305 → 22.0h/$3,194 | same | same, each with "N baselines" link | ✅ |
| Per skill | via linked `workflow_maps`; included deprecated "Meeting recap email" (9.4h) | 9 rows | — | ❌ deprecated skill counted — **fixed** filter (`mission-control.service.ts`). Live: 6 rows, none deprecated |
| Footnotes (source/baseline) | return tile must cite 12 baseline records | `return.baselineRefs` 25 refs (12 baseline, 12 measurement, 1 cost_input) | UI read `baselines`/`baselineIds` → "Baseline: no baseline" in italics and value greyed; per-row links "no baseline"; cost tile said "Analytics API seat counts" (no Analytics key) | ❌ — **fixed** `cost-view.tsx`/`types.ts`: "12 baseline records · 12 measurements", per-row "N baselines" with detail tooltip, ROI cites both, sources name the real tables |
| Waste | inactive 32/$1,920; premium unused 1/$200; skills unadopted 0; exercises abandoned 1 (skipped or active >14d) | same | 4 cards | ✅ |
| Save inputs round-trip | seat 60→65 ⇒ costTotal 3,120, total 32,800 | PUT then GET: 65, 3,120 | tile "$32,800", ROI −0.58; restored to 60 | ✅ |

## 9. Readouts

Generated `POST /mc/readouts {org, 2026-08-07..2026-09-06}` (live Claude, 10 s) → "LightCI Activate — Monthly Readout for Meridian Wealth Partners", 5 footnotes.

| Figure in narrative | Tab it should match | Verdict |
|---|---|---|
| 21.9 h/wk net of rework, baseline 76 h/wk, 12 baseline records [1] | Cost: 1,315 min = 21.9 h/wk, 95 h/mo, 12 baselines | ✅ |
| Weekly active 84.2% vs 57.9% first week, "19 people in scope" [2] | Adoption WAU 16 → 16/19 = 84.2% (people denominator, honestly stated; tile uses 48 seats) | ✅ |
| Mean rung 1.89 from 0.84, 13 of 19 moved up [3] | Journey placements | ✅ |
| 3 skills promoted vs 0 prior [4] | Governance merges 08-17, 08-26, 08-30 | ✅ |
| Expectation accuracy 0.89 vs 0.88 [5]; "7 revisits … slightly below the overall average, suggesting more friction" | Source line gives "7 revisits scored, mean 0.85" | ⚠ last sentence compares two different measures and infers a cause the data does not carry — Auditor prompt lets it editorialise. Open, low (`auditor.service.ts` SYSTEM). |
| List | 4 readouts, newest first; clicking mine renders identical narrative + 5 footnotes | ✅ |

## Fixes applied

Backend (`api/src/ops`, **API restart required** — the concurrent session restarted it at 21:59 and the live payloads confirm the changes):
- `metrics.service.ts`: `rungGains` no longer counts a first/diagnostic placement as a gain; new `isLearner`/`learners` helpers; unit test added in `metrics.service.spec.ts` (35 ops tests pass).
- `mission-control.service.ts`: People ranking, cohorts and time-in-rung restricted to learners; "rising" excludes inactive seats; `/mc/skills.health` returns every card per the contract; policy/boundary version+date fall back to `audit_log`; per-skill return excludes deprecated skills; removed unused `_m`.

Frontend (`frontend/components/mission-control`, `frontend/hooks/mc`): `adoption-view` (trend label, sessions sub, hasBaseline grey), `people-view` (hasBaseline/hasGrades), `journey-view` (parseISO), `groups-view` (30d label, server-normalised compare), `skills-view` (library size), `governance-view` (feed honesty + detail banner, row keys; `auto` mode label), `backlog-view` + `normalise.ts` (`score.hours`, no-baseline), `cost-view` (`baselineRefs`, tile sources, ROI/return gating), `types.ts`. `tsc --noEmit` clean for api and frontend; eslint clean on touched files.

## Open defects

| Sev | Tab | Defect |
|---|---|---|
| Low | Adoption | "MAU" tile is the calendar-month-to-date bucket (16), not trailing-30-day distinct (17); "WAU" tile is the ISO-week bucket. Matches the contract deviation, but labels should say so or the API should expose trailing windows. |
| Low | Adoption | Funnel "provisioned" counts people rows (18), not the 48 paid seats; the tile above says "of 48 seats". |
| Low | Cost vs Adoption/Groups | Team seat counts differ: Cost excludes `status='inactive'` people (CSO 4) while Adoption/Groups count them (CSO 5). Consistent per tab, inconsistent across tabs. |
| Low | Cost | Per-skill return attributes a workflow's full return to every skill linked to it (two skills → double count); rows sum above the org total. |
| Low | Readouts | Auditor may draw comparisons/causes beyond the supplied metrics (see [5]); tighten the SYSTEM prompt. |
| Low | Adoption | "Nudge" is a toast only; "Reassign seat" is a disabled stub (documented in tooltip). |
| Info | All | Seed was mutated by a concurrent session during the audit; SQL snapshots above are timestamped where values changed. |
