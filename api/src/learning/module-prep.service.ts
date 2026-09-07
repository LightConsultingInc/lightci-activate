import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { Rung } from '../common/roles';
import { Person } from '../orgs/entities/person.entity';
import { CoachService } from './coach.service';
import { COMPETENCY_BY_CODE } from './competency-catalog';
import { Exercise } from './entities/exercise.entity';
import { LessonPersonalisation } from './entities/lesson-personalisation.entity';
import { LessonsService, type GenericLesson } from './lessons.service';
import { MemoryService } from './memory.service';

export interface ModuleReadiness {
  status: 'ready' | 'preparing';
  lessons: { total: number; ready: number };
  practice: { ready: boolean };
  memoryVersion: number;
  /** True while the background job for this person+module is running. */
  inProgress: boolean;
}

export type ModuleLesson = GenericLesson & { slug: string };

const PRACTICE_STATUSES: Exercise['status'][] = ['queued', 'active', 'revise'];
const LESSON_CONCURRENCY = 3;

/** "L1" / "1" → 1; a competency code → its rung; otherwise null. */
export function moduleRung(code: string): Rung | null {
  const comp = COMPETENCY_BY_CODE.get(code);
  if (comp) return comp.rung;
  const m = /^L?([0-5])$/i.exec(code.trim());
  return m ? (Number(m[1]) as Rung) : null;
}

/**
 * Prepares a module ahead of the learner: personalises every lesson at the current memory version
 * (3 at a time) and makes sure a practice exercise is queued for the module's rung. Background,
 * in-process, one job per person+module; idempotent because each step checks the cache first.
 */
@Injectable()
export class ModulePrepService {
  private readonly logger = new Logger(ModulePrepService.name);
  private readonly jobs = new Map<string, Promise<void>>();

  constructor(
    @InjectRepository(LessonPersonalisation) private readonly rows: Repository<LessonPersonalisation>,
    @InjectRepository(Exercise) private readonly exercises: Repository<Exercise>,
    private readonly lessons: LessonsService,
    private readonly coach: CoachService,
    private readonly memory: MemoryService,
  ) {}

  private key(personId: string, code: string): string {
    return `${personId}:${code}`;
  }

  /** Current readiness without starting work. `slugs` (from a prepare call) widens `total` to lessons never personalised yet. */
  async readiness(person: Person, orgId: string | null, code: string, slugs: string[] = []): Promise<ModuleReadiness> {
    const memory = await this.memory.get(person.id, orgId);
    // Rows created before moduleCode existed carry null; the slug prefix ("l2-…") identifies their module.
    const known = (await this.rows.find({ where: { personId: person.id } })).filter(
      (r) => r.moduleCode === code || (!r.moduleCode && r.lessonSlug.toLowerCase().startsWith(`${code.toLowerCase()}-`)),
    );
    const all = new Set([...known.map((r) => r.lessonSlug), ...slugs]);
    const ready = new Set(known.filter((r) => r.memoryVersion === memory.version).map((r) => r.lessonSlug));
    const rung = moduleRung(code);
    const practiceReady = rung === null ? true : (await this.exercises.count({ where: { personId: person.id, rung, status: In(PRACTICE_STATUSES) } })) > 0;
    const total = all.size;
    const readyCount = [...all].filter((s) => ready.has(s)).length;
    const inProgress = this.jobs.has(this.key(person.id, code));
    return {
      status: total > 0 && readyCount === total && practiceReady && !inProgress ? 'ready' : 'preparing',
      lessons: { total, ready: readyCount },
      practice: { ready: practiceReady },
      memoryVersion: memory.version,
      inProgress,
    };
  }

  /** Start (or join) the background job and return the current readiness immediately. */
  async prepare(person: Person, orgId: string | null, code: string, lessons: ModuleLesson[]): Promise<ModuleReadiness> {
    const key = this.key(person.id, code);
    const before = await this.readiness(person, orgId, code, lessons.map((l) => l.slug));
    if (before.status === 'ready') return before;
    if (!this.jobs.has(key)) {
      const job = new Promise<void>((resolve) => {
        setImmediate(() => {
          this.run(person, orgId, code, lessons)
            .catch((error) => this.logger.warn(`Module prep ${key} failed: ${error instanceof Error ? error.message : String(error)}`))
            .finally(() => {
              this.jobs.delete(key);
              resolve();
            });
        });
      });
      this.jobs.set(key, job);
    }
    return { ...before, status: 'preparing', inProgress: true };
  }

  /** Resolves when the job for this person+module (if any) has finished. Used by tests and callers that want to await. */
  async whenIdle(personId: string, code: string): Promise<void> {
    await this.jobs.get(this.key(personId, code));
  }

  private async run(person: Person, orgId: string | null, code: string, lessons: ModuleLesson[], pass = 1): Promise<void> {
    const started = Date.now();
    const memory = await this.memory.get(person.id, orgId);
    const existing = await this.rows.find({ where: { personId: person.id, lessonSlug: In(lessons.map((l) => l.slug).concat('__none__')) } });
    const fresh = new Set(existing.filter((r) => r.memoryVersion === memory.version).map((r) => r.lessonSlug));
    const todo = lessons.filter((l) => !fresh.has(l.slug));
    let personalised = 0;
    for (let i = 0; i < todo.length; i += LESSON_CONCURRENCY) {
      const batch = todo.slice(i, i + LESSON_CONCURRENCY);
      const results = await Promise.allSettled(batch.map((l) => this.lessons.personalise(person, orgId, l.slug, l, code)));
      for (const r of results) {
        if (r.status === 'fulfilled') personalised += 1;
        else this.logger.warn(`Lesson personalisation in prep ${code} failed: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
      }
    }
    let practice = 'kept';
    const rung = moduleRung(code);
    if (rung !== null) {
      const queued = await this.exercises.count({ where: { personId: person.id, rung, status: In(PRACTICE_STATUSES) } });
      if (queued === 0) {
        await this.coach.generateNextExercise(person, orgId, { rung, moduleCode: code });
        practice = 'generated';
      }
    }
    this.logger.log(`Prepared module ${code} for ${person.id} in ${Date.now() - started}ms: ${personalised}/${todo.length} lessons personalised (${lessons.length - todo.length} already fresh), practice ${practice}.`);
    // Memory often moves right after intake (synthesis lands while we work). If it did, go once more so the
    // learner is not left with a module that is "prepared" at a stale version.
    const after = await this.memory.get(person.id, orgId);
    if (after.version !== memory.version && pass < 2) {
      this.logger.log(`Memory moved v${memory.version}→v${after.version} while preparing ${code}; re-preparing.`);
      await this.run(person, orgId, code, lessons, pass + 1);
    }
  }

  /** Module codes fully ready for this person at the current memory version (for the home page). */
  async preparedModules(person: Person, orgId: string | null): Promise<string[]> {
    const rows = await this.rows.find({ where: { personId: person.id } });
    const codes = [...new Set(rows.map((r) => r.moduleCode).filter((c): c is string => Boolean(c)))];
    const out: string[] = [];
    for (const code of codes) {
      const r = await this.readiness(person, orgId, code);
      if (r.status === 'ready') out.push(code);
    }
    return out.sort();
  }
}
