/**
 * Deterministic Interviewer responders for AI_PROVIDER=mock. Question k from a fixed list per mode;
 * completeness = min(1, turns / 8); scribe fields filled from the seed in a predictable order.
 */
import type { AiCall } from '../ai/ai.service';
import { registerMockResponder } from '../ai/mock-responders';
import type { InterviewMode } from './interviews.types';

const QUESTIONS: Record<InterviewMode, string[]> = {
  intake: [
    'Thanks for making time. To start simply: what is your role, and what are the two or three things you are responsible for week to week?',
    'Which of those tasks do you repeat every week? Name the ones that come to mind first.',
    'Take the first one. Roughly how many minutes does one run take, and how many times a week do you do it?',
    'Which systems or documents do you open to do it?',
    'How do you use Claude today, if at all, on your real work?',
    'On a scale of one to five, how comfortable are you delegating a first draft to Claude?',
    'People in your role often also do call prep or proposals. Is anything like that part of your week?',
    'Which step of that one is the slow or annoying part?',
    "Thanks, that's everything I need. We'll place you on the ladder now; give it a moment.",
  ],
  champion: [
    'Thanks for doing this. In a sentence or two, what does your team exist to do, and who depends on its output?',
    'What are the terms your team uses that a new hire would not understand on day one?',
    'Which two or three workflows take the most team time each week?',
    'For the biggest one: how often does it run, and how long does one run take per person?',
    'Which systems does the team live in?',
    'Who on the team does the biggest one, and what do they open first?',
    'What would make this program a success for you by the end of the wave?',
    "Thanks, that's everything I need. We'll place you on the ladder now; give it a moment.",
  ],
  workflow: [
    'Let us map this one workflow properly. Think of the last time you ran it: what was the trigger that made you start, and what did you open first?',
    'What is the purpose of the output, and who receives it?',
    'How often does it run, and how long does one run take?',
    'Walk me through the steps in order. For each, who or what does it: you, a system, or Claude today?',
    'Where do you make a judgement call, and what rule do you apply?',
    'What goes wrong, and how do you handle it when it does?',
    'Which inputs must never leave the firm?',
    'Where would a human need to review before the output goes out?',
    "Thanks, that's everything I need. We'll place you on the ladder now; give it a moment.",
  ],
};

type Seed = {
  mode: InterviewMode;
  turnCount: number;
  lastUser: string;
  scribe: Record<string, unknown>;
};

function seed(call: AiCall): Seed {
  const s = (call.mockSeed ?? {}) as Partial<Seed>;
  return {
    mode: s.mode ?? 'intake',
    turnCount: s.turnCount ?? 1,
    lastUser: s.lastUser ?? '',
    scribe: s.scribe ?? {},
  };
}

const nullIntake = {
  role: null,
  responsibilities: null,
  weeklyWorkflows: null,
  claudeUseToday: null,
  selfRatedComfort: null,
  sensitivities: null,
};
const nullWorkflow = {
  purpose: null,
  trigger: null,
  frequency: null,
  minutesPerRun: null,
  runsPerWeek: null,
  inputs: null,
  steps: null,
  decisions: null,
  exceptions: null,
  systems: null,
  mustNeverLeave: null,
  outputs: null,
  humanReview: null,
};
const nullChampion = {
  teamPurpose: null,
  vocabulary: null,
  anchorWorkflows: null,
  sensitivities: null,
  systems: null,
  priorities: null,
  seedWorkflows: null,
};

const text = (v: unknown, fallback: string): string =>
  typeof v === 'string' && v.trim() ? v : fallback;

function words(s: string): string[] {
  return s
    .split(/[,;]|\band\b/)
    .map((x) => x.trim())
    .filter((x) => x.length > 2)
    .slice(0, 4);
}

/** Scribe + checker body shared by interviewer.turn and interviewer.scribe. */
function scribeBody(call: AiCall) {
  const { mode, turnCount, lastUser } = seed(call);
  const completeness = Math.min(1, turnCount / 8);
  let scribeUpdate: Record<string, unknown>;
  if (mode === 'intake') {
    scribeUpdate = { ...nullIntake };
    if (turnCount === 1)
      Object.assign(scribeUpdate, {
        role: lastUser.slice(0, 80) || 'Analyst',
        responsibilities: words(lastUser),
      });
    if (turnCount === 2)
      scribeUpdate.weeklyWorkflows = words(lastUser).map((name) => ({
        name,
        minutesPerRun: 45,
        runsPerWeek: 1,
        systems: [],
      }));
    if (turnCount === 3)
      scribeUpdate.weeklyWorkflows = (
        Array.isArray((call.mockSeed as Seed).scribe?.weeklyWorkflows)
          ? ((call.mockSeed as Seed).scribe.weeklyWorkflows as {
              name: string;
              systems: string[];
            }[])
          : [{ name: 'Weekly report', systems: [] }]
      ).map((w, i) => ({
        name: w.name,
        minutesPerRun: i === 0 ? 60 : 45,
        runsPerWeek: i === 0 ? 2 : 1,
        systems: w.systems ?? [],
      }));
    if (turnCount === 4)
      scribeUpdate.weeklyWorkflows = (
        Array.isArray((call.mockSeed as Seed).scribe?.weeklyWorkflows)
          ? ((call.mockSeed as Seed).scribe.weeklyWorkflows as {
              name: string;
              minutesPerRun: number;
              runsPerWeek: number;
            }[])
          : [{ name: 'Weekly report', minutesPerRun: 60, runsPerWeek: 2 }]
      ).map((w) => ({
        ...w,
        systems: words(lastUser).length ? words(lastUser) : ['Email'],
      }));
    if (turnCount === 5)
      scribeUpdate.claudeUseToday =
        lastUser.slice(0, 200) || 'Occasional drafting';
    if (turnCount === 6)
      scribeUpdate.selfRatedComfort = Math.min(
        5,
        Math.max(1, parseInt(lastUser.match(/[1-5]/)?.[0] ?? '3', 10)),
      );
  } else if (mode === 'champion') {
    scribeUpdate = { ...nullChampion };
    if (turnCount === 1)
      scribeUpdate.teamPurpose = lastUser.slice(0, 200) || 'Advisory support';
    if (turnCount === 2)
      scribeUpdate.vocabulary = words(lastUser).map((term) => ({
        term,
        meaning: `Team term: ${term}`,
      }));
    if (turnCount === 3)
      Object.assign(scribeUpdate, {
        anchorWorkflows: words(lastUser),
        seedWorkflows: words(lastUser).map((name) => ({
          name,
          purpose: `${name} for the team`,
          frequency: 'weekly',
          minutesPerRun: 45,
          runsPerWeek: 2,
          systems: [],
        })),
      });
    if (turnCount === 5) scribeUpdate.systems = words(lastUser);
    if (turnCount === 7) scribeUpdate.priorities = words(lastUser);
  } else {
    scribeUpdate = { ...nullWorkflow };
    if (turnCount === 1)
      Object.assign(scribeUpdate, {
        trigger: lastUser.slice(0, 160) || 'Monday morning',
        inputs: [
          {
            name: 'Previous notes',
            source: 'Shared drive',
            dataClass: 'internal',
          },
        ],
      });
    if (turnCount === 2)
      Object.assign(scribeUpdate, {
        purpose: lastUser.slice(0, 200) || 'Prepare the weekly pack',
        outputs: [{ name: 'Pack', destination: 'Team meeting' }],
      });
    if (turnCount === 3)
      Object.assign(scribeUpdate, {
        frequency: 'weekly',
        minutesPerRun: 60,
        runsPerWeek: 1,
      });
    if (turnCount === 4)
      scribeUpdate.steps = words(lastUser).map((action, i) => ({
        order: i + 1,
        action,
        actor: 'human',
        system: null,
      }));
    if (turnCount === 5)
      scribeUpdate.decisions = [
        {
          point: 'Before sending',
          rule: lastUser.slice(0, 120) || 'Check figures against source',
        },
      ];
    if (turnCount === 6)
      scribeUpdate.exceptions = [
        {
          case: 'Missing input',
          handling: lastUser.slice(0, 120) || 'Ask the owner',
        },
      ];
    if (turnCount === 7)
      Object.assign(scribeUpdate, {
        mustNeverLeave: words(lastUser).length
          ? words(lastUser)
          : ['client account data'],
        systems: ['CRM', 'Email'],
      });
    if (turnCount === 8)
      scribeUpdate.humanReview = [
        lastUser.slice(0, 120) || 'Before the pack is sent',
      ];
  }
  return {
    scribeUpdate,
    checkerFlags:
      turnCount === 3 && mode !== 'champion'
        ? [
            {
              field: mode === 'intake' ? 'weeklyWorkflows' : 'runsPerWeek',
              issue:
                'Time estimate given without a frequency; confirm runs per week.',
            },
          ]
        : [],
    completeness,
  };
}

registerMockResponder('interviewer.turn', (call) => {
  const { mode, turnCount } = seed(call);
  const list = QUESTIONS[mode];
  const body = scribeBody(call);
  return {
    nextQuestion: list[Math.min(turnCount, list.length - 1)],
    ...body,
    proposeFinish: body.completeness >= 0.85,
    finish: false,
  };
});

/** Voice mode: the Realtime agent asked the question; only scribe/checker/completeness come back. */
registerMockResponder('interviewer.scribe', (call) => scribeBody(call));

/** Full WorkflowScribe-shaped draft used by compactMap (intake/champion) and the workflow completion. */
const wfSchema = (
  name: string,
  minutes: number,
  runs: number,
  systems: string[],
) => ({
  purpose: `Produce the ${name.toLowerCase()} on time to the usual standard`,
  trigger: 'Start of the week',
  frequency: 'weekly' as const,
  minutesPerRun: minutes,
  runsPerWeek: runs,
  inputs: [
    {
      name: 'Previous version',
      source: 'Shared drive',
      dataClass: 'internal',
    },
  ],
  steps: [
    {
      order: 1,
      action: 'Gather inputs',
      actor: 'human' as const,
      system: systems[0] ?? null,
    },
    { order: 2, action: 'Draft', actor: 'claude' as const, system: null },
    {
      order: 3,
      action: 'Review and send',
      actor: 'human' as const,
      system: 'Email',
    },
  ],
  decisions: [{ point: 'Before sending', rule: 'Figures match the source' }],
  exceptions: [{ case: 'Missing input', handling: 'Ask the owner and delay' }],
  systems,
  mustNeverLeave: ['client account data'],
  outputs: [{ name, destination: 'Team' }],
  humanReview: ['Before sending'],
});

/** Compact completion draft (see WorkflowMapOut): flat string lists instead of nested objects. */
function compactMap(
  name: string,
  minutesPerRun: number,
  runsPerWeek: number,
  systems: string[],
) {
  const s = wfSchema(name, minutesPerRun, runsPerWeek, systems) as Record<
    string,
    any
  >;
  return {
    name,
    purpose: String(s.purpose ?? `${name} done reliably each week`),
    trigger: String(s.trigger ?? 'Weekly schedule'),
    frequency: (s.frequency ?? 'weekly') as
      'daily' | 'weekly' | 'monthly' | 'ad_hoc',
    minutesPerRun,
    runsPerWeek,
    inputs: ((s.inputs ?? []) as { name: string; source: string }[]).map(
      (i) => `${i.name} — ${i.source}`,
    ),
    steps: ((s.steps ?? []) as { action: string; actor: string }[]).map(
      (st) => `${st.actor}: ${st.action}`,
    ),
    decisions: ((s.decisions ?? []) as { point: string; rule: string }[]).map(
      (d) => `${d.point} — ${d.rule}`,
    ),
    exceptions: (
      (s.exceptions ?? []) as { case: string; handling: string }[]
    ).map((e) => `${e.case} — ${e.handling}`),
    systems,
    mustNeverLeave: (s.mustNeverLeave ?? []) as string[],
    outputs: ((s.outputs ?? []) as { name: string; destination: string }[]).map(
      (o) => `${o.name} — ${o.destination}`,
    ),
    humanReview: (s.humanReview ?? []) as string[],
  };
}

registerMockResponder('interviewer.complete', (call) => {
  const { mode, scribe } = seed(call);
  const layer = (summary: string) => ({
    summary,
    vocabulary: (scribe.vocabulary as
      { term: string; meaning: string }[] | undefined) ?? [
      { term: 'pack', meaning: 'the weekly briefing document' },
    ],
    anchorWorkflows: (scribe.anchorWorkflows as string[] | undefined) ?? [
      'Weekly report',
    ],
    sensitivities: (scribe.sensitivities as string[] | undefined) ?? [],
    systems: (scribe.systems as string[] | undefined) ?? ['Email', 'CRM'],
  });
  if (mode === 'intake') {
    const wfs =
      (scribe.weeklyWorkflows as
        | {
            name: string;
            minutesPerRun: number;
            runsPerWeek: number;
            systems: string[];
          }[]
        | undefined) ?? [];
    const named = wfs.length
      ? wfs
      : [
          {
            name: 'Weekly report',
            minutesPerRun: 60,
            runsPerWeek: 1,
            systems: ['Email'],
          },
          {
            name: 'Meeting prep',
            minutesPerRun: 30,
            runsPerWeek: 2,
            systems: ['Calendar'],
          },
        ];
    const padded =
      named.length >= 2
        ? named.slice(0, 4)
        : [
            ...named,
            {
              name: 'Meeting prep',
              minutesPerRun: 30,
              runsPerWeek: 2,
              systems: ['Calendar'],
            },
          ];
    const comfort = Number(scribe.selfRatedComfort ?? 3);
    const rung = comfort >= 4 ? 2 : comfort >= 3 ? 1 : 0;
    return {
      profile: {
        role: text(scribe.role, 'Analyst'),
        responsibilities: (scribe.responsibilities as string[] | undefined) ?? [
          'Weekly reporting',
        ],
        weeklyWorkflows: padded,
        claudeUseToday: text(scribe.claudeUseToday, 'Occasional drafting'),
        selfRatedComfort: comfort,
        sensitivities: (scribe.sensitivities as string[] | undefined) ?? [],
      },
      contextLayer: layer(
        `${text(scribe.role, 'Analyst')} responsible for ${((scribe.responsibilities as string[] | undefined) ?? ['weekly reporting']).join(', ')}; repeats ${padded.map((w) => w.name).join(', ')} weekly.`,
      ),
      workflowMaps: padded.map((w) =>
        compactMap(w.name, w.minutesPerRun, w.runsPerWeek, w.systems),
      ),
      placement: {
        rung,
        evidence: [
          `Self-rated comfort ${comfort}/5`,
          `Claude use today: ${text(scribe.claudeUseToday, 'occasional drafting')}`,
        ],
      },
    };
  }
  if (mode === 'champion') {
    const seeds = (scribe.seedWorkflows as
      | {
          name: string;
          minutesPerRun: number;
          runsPerWeek: number;
          systems: string[];
        }[]
      | undefined) ?? [
      {
        name: 'Weekly report',
        minutesPerRun: 60,
        runsPerWeek: 2,
        systems: ['Email'],
      },
      {
        name: 'Client summary',
        minutesPerRun: 45,
        runsPerWeek: 3,
        systems: ['CRM'],
      },
    ];
    return {
      teamPurpose: text(scribe.teamPurpose, 'Advisory support'),
      contextLayer: layer(text(scribe.teamPurpose, 'Advisory support team')),
      workflowMaps: seeds.map((w) =>
        compactMap(w.name, w.minutesPerRun, w.runsPerWeek, w.systems),
      ),
      priorities: (scribe.priorities as string[] | undefined) ?? [
        'Cut weekly reporting time',
      ],
    };
  }
  const merged = {
    ...wfSchema('Mapped workflow', 60, 1, ['CRM', 'Email']),
    ...Object.fromEntries(
      Object.entries(scribe).filter(([, v]) => v !== null && v !== undefined),
    ),
  };
  return { name: null, schema: merged, completeness: 0.9, openQuestions: [] };
});
