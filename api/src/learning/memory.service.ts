import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { z } from 'zod';
import { AiService } from '../ai/ai.service';
import { RUNG_META, type Rung } from '../common/roles';
import { ContextLayer } from '../context/entities/context-layer.entity';
import { Person } from '../orgs/entities/person.entity';
import { COMPETENCY_BY_CODE } from './competency-catalog';
import { COACH_SYSTEM } from './prompts';
import './learning.mocks';

export const MEMORY_EVENT_KINDS = [
  'interview_completed',
  'submission_graded',
  'exercise_skipped',
  'skill_adopted',
  'lesson_checked',
  'revisit_answered',
] as const;
export type MemoryEventKind = (typeof MEMORY_EVENT_KINDS)[number];

/** Compact, PII-free record of something that happened in the learning loop. */
export interface MemoryEvent {
  kind: MemoryEventKind;
  /** One plain sentence the synthesiser can read ("Graded 'Draft the RMD letter': 0.62 revise; missed: format; teaching: name the reader."). */
  note: string;
  at?: string;
  data?: {
    /** Tools the learner named in their work (fed straight into `systems`, then offered as connectors). */
    tools?: string[];
    exerciseTitle?: string;
    score?: number;
    decision?: 'pass' | 'revise';
    /** Rubric labels scored below 0.75 (practice v2); previously the missed self-check items. */
    missed?: string[];
    missedSelfCheck?: string[];
    teachingMoment?: string | null;
    /** Practice v2: the "try next" line, the score out of 10 and the input kind. */
    tryNext?: string | null;
    score10?: number;
    practiceKind?: string;
    skipReason?: string;
    skillName?: string;
    lessonSlug?: string;
    correct?: boolean;
    competencyCode?: string;
    mode?: string;
    workSurface?: string;
  };
}

export const MAX_EVENTS = 40;
export const SYNTHESIS_EVERY = 3;

export interface PersonMemory {
  summary: string | null;
  strengths: string[];
  struggles: string[];
  preferences: string[];
  vocabulary: { term: string; meaning: string }[];
  systems: string[];
  anchorWorkflows: string[];
  version: number;
  updatedAt: string | null;
  lastEvents: { at: string; kind: string; note: string }[];
}

export const MemorySynthesisSchema = z.object({
  summary: z
    .string()
    .describe(
      '4–6 sentences: who they are, how they work, strengths, recurring struggles, preferences. Factual, plain, no PII, no rung codes.',
    ),
  strengths: z
    .array(z.string())
    .describe('Short phrases, evidenced by the events. 0–6.'),
  struggles: z
    .array(z.string())
    .describe(
      'Recurring difficulties, short phrases, evidenced by the events. 0–6.',
    ),
  preferences: z
    .array(z.string())
    .describe(
      'How they like to work ("prefers typing", "no time during month-end"). 0–6.',
    ),
  vocabulary: z
    .array(z.object({ term: z.string(), meaning: z.string() }))
    .describe('Their own terms; keep previous ones unless contradicted.'),
  systems: z.array(z.string()),
  anchorWorkflows: z
    .array(z.string())
    .describe('The weekly workflows they keep coming back to.'),
});

export const WhyMeSchema = z.object({
  line: z
    .string()
    .describe('One sentence, second person, plain words, no rung codes.'),
});

/**
 * The living person memory: appends compact events to the person ContextLayer and periodically
 * re-synthesises the narrative (summary, strengths, struggles, preferences, vocabulary, systems,
 * anchor workflows) with task memory.synthesise, bumping `version`. Coach, lessons and the
 * "What Coach knows about you" panel read from it.
 */
@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    @InjectRepository(ContextLayer)
    private readonly layers: Repository<ContextLayer>,
    @InjectRepository(Person) private readonly people: Repository<Person>,
    private readonly ai: AiService,
  ) {}

  async layerFor(
    personId: string,
    orgId: string,
    create = false,
  ): Promise<ContextLayer | null> {
    const existing = await this.layers.findOne({
      where: { orgId, layer: 'person', ownerId: personId },
    });
    if (existing || !create) return existing;
    return this.layers.create({
      orgId,
      layer: 'person',
      ownerId: personId,
      summary: null,
      vocabulary: [],
      anchorWorkflows: [],
      sensitivities: [],
      systems: [],
      strengths: [],
      struggles: [],
      preferences: [],
      lastEvents: [],
      eventsSinceSynthesis: 0,
      synthesisedAt: null,
      moduleLines: {},
      version: 0,
    });
  }

  toMemory(layer: ContextLayer | null): PersonMemory {
    return {
      summary: layer?.summary ?? null,
      strengths: layer?.strengths ?? [],
      struggles: layer?.struggles ?? [],
      preferences: layer?.preferences ?? [],
      vocabulary: layer?.vocabulary ?? [],
      systems: layer?.systems ?? [],
      anchorWorkflows: layer?.anchorWorkflows ?? [],
      version: layer?.version ?? 0,
      updatedAt: layer?.updatedAt
        ? new Date(layer.updatedAt).toISOString()
        : null,
      lastEvents: layer?.lastEvents ?? [],
    };
  }

  async get(personId: string, orgId: string | null): Promise<PersonMemory> {
    if (!orgId) return this.toMemory(null);
    return this.toMemory(await this.layerFor(personId, orgId));
  }

  /** Append one event; synthesise when it is an interview completion or ≥ 3 events have accrued since the last synthesis. */
  /**
   * Fold tools the learner named in their work into the memory's systems at once (no version bump, so no
   * lesson re-personalisation), so the practice composer offers them as connectors from the next exercise.
   */
  async noteSystems(
    personId: string,
    orgId: string | null,
    tools: string[],
  ): Promise<void> {
    if (!orgId) return;
    const clean = dedupe(tools).filter((t) => t.length <= 40);
    if (clean.length === 0) return;
    const layer = (await this.layerFor(personId, orgId, true)) as ContextLayer;
    const before = layer.systems?.length ?? 0;
    layer.systems = dedupe([...(layer.systems ?? []), ...clean]).slice(0, 24);
    if (layer.systems.length !== before) await this.layers.save(layer);
  }

  async record(
    personId: string,
    orgId: string | null,
    event: MemoryEvent,
  ): Promise<PersonMemory> {
    if (!orgId) return this.toMemory(null);
    const layer = (await this.layerFor(personId, orgId, true)) as ContextLayer;
    const entry = {
      at: event.at ?? new Date().toISOString(),
      kind: event.kind,
      note: scrub(event.note).slice(0, 300),
    };
    layer.lastEvents = [...(layer.lastEvents ?? []), entry].slice(-MAX_EVENTS);
    layer.eventsSinceSynthesis = (layer.eventsSinceSynthesis ?? 0) + 1;
    if (
      event.kind === 'interview_completed' ||
      layer.eventsSinceSynthesis >= SYNTHESIS_EVERY
    ) {
      try {
        await this.synthesise(layer, personId, orgId);
      } catch (error) {
        this.logger.warn(
          `Memory synthesis failed for ${personId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    const saved = await this.layers.save(layer);
    return this.toMemory(saved);
  }

  /** Rewrite the narrative from the previous memory + the events since the last synthesis (task memory.synthesise). Mutates `layer`. */
  async synthesise(
    layer: ContextLayer,
    personId: string,
    orgId: string,
  ): Promise<void> {
    const person = await this.people.findOne({ where: { id: personId } });
    const fresh = layer.lastEvents.slice(
      -Math.max(1, layer.eventsSinceSynthesis),
    );
    const previous = this.toMemory(layer);
    const out = await this.ai.structured(
      {
        agent: 'coach',
        task: 'memory.synthesise',
        orgId,
        personId,
        effort: 'medium',
        system: `${COACH_SYSTEM}

This call maintains the Coach's memory of one learner. Rewrite the memory from the previous memory plus the new events. Keep it factual and grounded in the events; do not speculate about personality. Never include client names, account details or anything sensitive. No rung codes (say "the drafting stage" not "L1"). Keep previous vocabulary and workflows unless the events contradict them. Preferences are only what the learner showed or said ("prefers typing", "no time during month-end", "skips when blocked by access").`,
        messages: [
          {
            role: 'user',
            content: [
              `# Learner`,
              `Role: ${person?.title ?? 'unknown'}`,
              `Profile: ${JSON.stringify(person?.profile ?? {})}`,
              '',
              '# Previous memory',
              JSON.stringify(
                {
                  summary: previous.summary,
                  strengths: previous.strengths,
                  struggles: previous.struggles,
                  preferences: previous.preferences,
                  vocabulary: previous.vocabulary,
                  systems: previous.systems,
                  anchorWorkflows: previous.anchorWorkflows,
                },
                null,
                2,
              ),
              '',
              `# New events since the last rewrite (${fresh.length})`,
              ...fresh.map(
                (e) => `- ${e.at.slice(0, 10)} ${e.kind}: ${e.note}`,
              ),
              '',
              `# Older events (for context)`,
              ...layer.lastEvents
                .slice(0, -fresh.length)
                .slice(-12)
                .map((e) => `- ${e.at.slice(0, 10)} ${e.kind}: ${e.note}`),
            ].join('\n'),
          },
        ],
        mockSeed: {
          previous,
          events: fresh,
          allEvents: layer.lastEvents,
          role: person?.title ?? null,
          profile: person?.profile ?? {},
        },
      },
      MemorySynthesisSchema,
    );
    layer.summary = out.summary.trim();
    layer.strengths = dedupe(out.strengths).slice(0, 6);
    layer.struggles = dedupe(out.struggles).slice(0, 6);
    layer.preferences = dedupe(out.preferences).slice(0, 6);
    layer.vocabulary = out.vocabulary.filter((v) => v.term.trim()).slice(0, 40);
    layer.systems = dedupe(out.systems);
    layer.anchorWorkflows = dedupe(out.anchorWorkflows);
    layer.version = (layer.version ?? 0) + 1;
    layer.eventsSinceSynthesis = 0;
    layer.synthesisedAt = new Date();
  }

  /** One sentence on why a module matters for this person, cached per memory version on the layer. */
  async whyMe(
    person: Person,
    orgId: string | null,
    code: string,
  ): Promise<{ line: string }> {
    const module = describeModule(code);
    if (!orgId) return { line: genericWhy(module.name) };
    const layer = await this.layerFor(person.id, orgId);
    if (!layer) return { line: genericWhy(module.name) };
    const cached = layer.moduleLines?.[code];
    if (cached && cached.version === layer.version)
      return { line: cached.line };
    const memory = this.toMemory(layer);
    let line: string;
    try {
      const out = await this.ai.structured(
        {
          agent: 'coach',
          task: 'memory.why-me',
          orgId,
          personId: person.id,
          effort: 'low',
          model: this.ai.fastModel,
          system: `${COACH_SYSTEM}\n\nWrite one sentence, to the learner, on why this module matters for them right now, grounded in their memory (their workflows, struggles, strengths). Plain words, second person, no rung codes, no flattery.`,
          messages: [
            {
              role: 'user',
              content: `# Module\n${module.name}: ${module.description}\n\n# Memory\n${JSON.stringify({ summary: memory.summary, strengths: memory.strengths, struggles: memory.struggles, preferences: memory.preferences, anchorWorkflows: memory.anchorWorkflows }, null, 2)}`,
            },
          ],
          mockSeed: {
            module: module.name,
            struggles: memory.struggles,
            anchorWorkflows: memory.anchorWorkflows,
            role: person.title,
          },
        },
        WhyMeSchema,
      );
      line = out.line.trim();
    } catch (error) {
      this.logger.warn(
        `why-me failed for ${person.id}/${code}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { line: genericWhy(module.name) };
    }
    layer.moduleLines = {
      ...(layer.moduleLines ?? {}),
      [code]: { line, version: layer.version },
    };
    await this.layers.save(layer);
    return { line };
  }
}

/** A module code is a competency code ("L1.description") or a rung code ("L1" / "1"). */
export function describeModule(code: string): {
  name: string;
  description: string;
} {
  const comp = COMPETENCY_BY_CODE.get(code);
  if (comp) return { name: comp.name, description: comp.description };
  const rung = /^L?([0-5])$/i.exec(code.trim());
  if (rung) {
    const meta = RUNG_META[Number(rung[1]) as Rung];
    return { name: meta.name, description: meta.competency };
  }
  return { name: code, description: 'This module.' };
}

function genericWhy(name: string): string {
  return `${name} is the next step on the way to handing real work to Claude and trusting what comes back.`;
}

function dedupe(xs: string[]): string[] {
  const seen = new Set<string>();
  return xs
    .map((x) => x.trim())
    .filter(
      (x) =>
        x && !seen.has(x.toLowerCase()) && (seen.add(x.toLowerCase()), true),
    );
}

/** Strip the obvious PII shapes from an event note before it is stored. */
function scrub(note: string): string {
  return note
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[ssn]')
    .replace(/\b\d{9,}\b/g, '[number]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]');
}
