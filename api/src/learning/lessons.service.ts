import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { z } from 'zod';
import { AiService } from '../ai/ai.service';
import { ContextLayer } from '../context/entities/context-layer.entity';
import { Person } from '../orgs/entities/person.entity';
import { WorkflowMap } from '../workflows/entities/workflow-map.entity';
import {
  LessonPersonalisation,
  type LessonCheck,
  type LessonExample,
} from './entities/lesson-personalisation.entity';
import { MemoryService } from './memory.service';
import { COACH_SYSTEM } from './prompts';
import { buildSituation, type LearnerSituation } from './situation';
import './learning.mocks';

export interface GenericLesson {
  rung: number;
  title: string;
  promise: string;
  body: string;
  keyPoints: string[];
  example: LessonExample;
  check: LessonCheck;
}

export interface PersonalisedLesson {
  example: LessonExample;
  check: LessonCheck;
  personalised: boolean;
}

export const PersonaliseLessonSchema = z.object({
  example: z.object({
    title: z
      .string()
      .describe("Short title naming the learner's own workflow."),
    text: z
      .string()
      .describe(
        "The lesson's idea applied to that workflow, 3–6 plain sentences, second person, placeholders for anything client-specific.",
      ),
  }),
  check: z.object({
    question: z
      .string()
      .describe(
        "One question that tests the lesson's idea, framed in the learner's situation, answerable from the lesson body alone.",
      ),
    options: z
      .array(z.string())
      .describe('3–4 short options; exactly one correct.'),
    answer: z.number().int().describe('Index of the correct option.'),
    explanation: z
      .string()
      .describe('One or two sentences on why, in plain words.'),
  }),
});

/**
 * Personalised lessons: the client posts the generic lesson; when the person has a person-layer
 * context or an intake profile, the example and check are rewritten once from their own workflows
 * and cached per (person, lesson).
 */
@Injectable()
export class LessonsService {
  private readonly logger = new Logger(LessonsService.name);

  constructor(
    @InjectRepository(LessonPersonalisation)
    private readonly rows: Repository<LessonPersonalisation>,
    @InjectRepository(ContextLayer)
    private readonly layers: Repository<ContextLayer>,
    @InjectRepository(WorkflowMap)
    private readonly workflows: Repository<WorkflowMap>,
    private readonly ai: AiService,
    private readonly memory: MemoryService,
  ) {}

  /** Role, responsibilities and weekly workflows from the person ContextLayer, their WorkflowMaps and Person.profile. Null when nothing is known. */
  async situationFor(
    person: Person,
    orgId: string | null,
  ): Promise<LearnerSituation | null> {
    const [layer, maps] = await Promise.all([
      orgId
        ? this.layers.findOne({
            where: { orgId, layer: 'person', ownerId: person.id },
          })
        : null,
      orgId
        ? this.workflows.find({
            where: { orgId, ownerPersonId: person.id },
            order: { updatedAt: 'DESC' },
            take: 8,
          })
        : [],
    ]);
    return buildSituation(person, layer, maps);
  }

  async personalise(
    person: Person,
    orgId: string | null,
    slug: string,
    lesson: GenericLesson,
    moduleCode: string | null = null,
  ): Promise<PersonalisedLesson> {
    const situation = await this.situationFor(person, orgId);
    if (!situation)
      return {
        example: lesson.example,
        check: lesson.check,
        personalised: false,
      };
    const memory = await this.memory.get(person.id, orgId);
    const cached = await this.rows.findOne({
      where: { personId: person.id, lessonSlug: slug },
    });
    if (
      cached &&
      cached.memoryVersion === memory.version &&
      moduleCode &&
      cached.moduleCode !== moduleCode
    )
      await this.rows.save(Object.assign(cached, { moduleCode }));
    if (cached && cached.memoryVersion === memory.version)
      return {
        example: cached.example,
        check: cached.check,
        personalised: true,
      };

    let out: z.infer<typeof PersonaliseLessonSchema>;
    try {
      out = await this.ai.structured(
        {
          agent: 'coach',
          task: 'coach.personalise-lesson',
          orgId,
          personId: person.id,
          effort: 'medium',
          system: `${COACH_SYSTEM}

This call rewrites one lesson's example and check for one learner. The example must be one of THEIR workflows with the lesson's idea applied to it, in plain second-person language. The check must test the lesson's idea using THEIR situation as the framing and be answerable from the lesson body alone (no outside knowledge, no trick options). No rung codes, no jargon, no client data.`,
          messages: [
            {
              role: 'user',
              content: [
                `# Lesson "${lesson.title}" (slug ${slug})`,
                `Promise: ${lesson.promise}`,
                `Key points: ${lesson.keyPoints.join(' | ')}`,
                '',
                '# Lesson body',
                lesson.body,
                '',
                '# Generic example (rewrite this for the learner)',
                `${lesson.example.title}\n${lesson.example.text}`,
                '',
                '# Generic check (rewrite this for the learner; keep exactly one correct option)',
                JSON.stringify(lesson.check),
                '',
                '# Learner',
                `Role: ${situation.role ?? 'unknown'}`,
                `Responsibilities: ${situation.responsibilities.join('; ') || '(none recorded)'}`,
                `Weekly workflows: ${situation.workflows.map((w) => `${w.name}${w.runsPerWeek ? ` (${w.runsPerWeek}×/week${w.minutesPerRun ? `, ${w.minutesPerRun} min` : ''})` : ''}${w.inputs?.length ? `; inputs: ${w.inputs.join(', ')}` : ''}${w.outputs?.length ? `; outputs: ${w.outputs.join(', ')}` : ''}`).join('\n  ') || '(none recorded)'}`,
                `Systems: ${situation.systems.join(', ') || '(none recorded)'}`,
                situation.summary ? `Context: ${situation.summary}` : '',
                '',
                '# What Coach remembers (use the struggles to choose the framing)',
                memory.summary
                  ? `Summary: ${memory.summary}`
                  : 'Summary: (nothing yet)',
                `Struggles: ${memory.struggles.join('; ') || '(none recorded)'}`,
                `Strengths: ${memory.strengths.join('; ') || '(none recorded)'}`,
              ]
                .filter((l) => l !== '')
                .join('\n'),
            },
          ],
          mockSeed: {
            slug,
            workflow: situation.workflows[0]?.name ?? null,
            role: situation.role,
            example: lesson.example,
            check: lesson.check,
          },
        },
        PersonaliseLessonSchema,
      );
    } catch (error) {
      this.logger.warn(
        `Lesson personalisation failed for ${person.id}/${slug}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        example: lesson.example,
        check: lesson.check,
        personalised: false,
      };
    }
    const options = out.check.options
      .map((o) => o.trim())
      .filter(Boolean)
      .slice(0, 4);
    const valid =
      options.length >= 3 &&
      out.check.answer >= 0 &&
      out.check.answer < options.length;
    const check: LessonCheck = valid
      ? {
          question: out.check.question,
          options,
          answer: out.check.answer,
          explanation: out.check.explanation,
        }
      : lesson.check;
    const example: LessonExample = {
      title: out.example.title.slice(0, 120),
      text: out.example.text,
    };
    const model = this.ai.provider === 'mock' ? 'mock' : this.ai.defaultModel;
    const row = await this.rows.save(
      cached
        ? Object.assign(cached, {
            example,
            check,
            model,
            memoryVersion: memory.version,
            moduleCode: moduleCode ?? cached.moduleCode ?? null,
          })
        : this.rows.create({
            personId: person.id,
            lessonSlug: slug,
            example,
            check,
            model,
            memoryVersion: memory.version,
            moduleCode,
          }),
    );
    return { example: row.example, check: row.check, personalised: true };
  }

  /** The learner answered a lesson check; remembered as a lesson_checked event. */
  async checked(
    person: Person,
    orgId: string | null,
    slug: string,
    correct: boolean,
  ): Promise<{ ok: true; memoryVersion: number }> {
    const memory = await this.memory.record(person.id, orgId, {
      kind: 'lesson_checked',
      note: `Lesson check "${slug}": ${correct ? 'correct' : 'incorrect'}.`,
      data: { lessonSlug: slug, correct },
    });
    return { ok: true, memoryVersion: memory.version };
  }
}
