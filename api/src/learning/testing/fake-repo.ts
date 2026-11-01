/**
 * Minimal in-memory stand-in for a TypeORM Repository, enough for the learning specs:
 * create / save / find / findOne / count / upsert with equality `where` (incl. `In`, `IsNull`, `Not(IsNull())`).
 */
import { randomUUID } from 'node:crypto';
import { FindOperator } from 'typeorm';
import type { ZodType } from 'zod';
import type { AiCall, AiTextResult } from '../../ai/ai.service';
import { mockResponder } from '../../ai/mock-responders';

type Row = Record<string, any>;
type Order = Record<string, 'ASC' | 'DESC'>;

// Relational compares exactly as JS does on the raw values (Dates via valueOf).
const lte = (a: unknown, b: unknown): boolean => (a as number) <= (b as number);
const gte = (a: unknown, b: unknown): boolean => (a as number) >= (b as number);

function matches(row: Row, where: Row | Row[] | undefined): boolean {
  if (!where) return true;
  if (Array.isArray(where)) return where.some((w) => matches(row, w));
  return Object.entries(where).every(([k, v]) => {
    const actual: unknown = row[k];
    if (v instanceof FindOperator) {
      const type = v.type;
      const value: unknown = v.value;
      if (type === 'in') return (value as unknown[]).includes(actual);
      if (type === 'isNull') return actual === null || actual === undefined;
      if (type === 'not') {
        const inner = value as FindOperator<unknown>;
        if (inner.type === 'isNull')
          return !(actual === null || actual === undefined);
        return actual !== inner.value;
      }
      if (type === 'lessThanOrEqual') return lte(actual, value);
      if (type === 'moreThanOrEqual') return gte(actual, value);
      return true;
    }
    return actual === v;
  });
}

function sortRows(rows: Row[], order?: Order): Row[] {
  if (!order) return rows;
  const [[key, dir]] = Object.entries(order);
  const keyOf = (r: Row): number => {
    const v: unknown = r[key];
    return (v instanceof Date ? v.getTime() : v) as number;
  };
  return [...rows].sort((a, b) => {
    const x = keyOf(a);
    const y = keyOf(b);
    return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'DESC' ? -1 : 1);
  });
}

/** The slice of SelectQueryBuilder the learning services touch. */
export interface FakeQueryBuilder {
  _where: { personId?: string } | null;
  select(): FakeQueryBuilder;
  addSelect(): FakeQueryBuilder;
  where(sql: string, params?: Row): FakeQueryBuilder;
  andWhere(): FakeQueryBuilder;
  groupBy(): FakeQueryBuilder;
  orderBy(): FakeQueryBuilder;
  getRawMany(): Promise<Row[]>;
  getMany(): Promise<Row[]>;
}

export class FakeRepo<T extends Row> {
  rows: T[] = [];
  constructor(seed: Partial<T>[] = []) {
    for (const s of seed) this.rows.push(this.withId(s));
  }
  private withId(s: Row): T {
    return { id: randomUUID(), createdAt: new Date(), ...s } as unknown as T;
  }
  create(x: Partial<T> | Partial<T>[]): any {
    return Array.isArray(x) ? x.map((y) => ({ ...y })) : { ...x };
  }
  /** Saves one row or an array of rows; resolves to the stored row(s) in the same shape. */
  save<X extends Row | Row[]>(x: X): Promise<X extends unknown[] ? T[] : T> {
    type Saved = X extends unknown[] ? T[] : T;
    const saved: T | T[] = Array.isArray(x)
      ? x.map((y: Row) => this.saveOne(y))
      : this.saveOne(x);
    return Promise.resolve(saved as Saved);
  }
  private saveOne(x: Row): T {
    const existing = x.id ? this.rows.find((r) => r.id === x.id) : undefined;
    if (existing) {
      Object.assign(existing, x);
      return existing;
    }
    const row = this.withId(x);
    this.rows.push(row);
    Object.assign(x, row);
    return row;
  }
  find(
    opts: { where?: Row | Row[]; order?: Order; take?: number } = {},
  ): Promise<T[]> {
    let out = sortRows(
      this.rows.filter((r) => matches(r, opts.where)),
      opts.order,
    ) as T[];
    if (opts.take) out = out.slice(0, opts.take);
    return Promise.resolve(out);
  }
  async findOne(opts: {
    where?: Row | Row[];
    order?: Order;
  }): Promise<T | null> {
    return (await this.find(opts))[0] ?? null;
  }
  async count(opts: { where?: Row | Row[] } = {}): Promise<number> {
    return (await this.find(opts)).length;
  }
  upsert(rows: Partial<T>[], conflict: string[]): Promise<void> {
    for (const r of rows) {
      const existing = this.rows.find((x) =>
        conflict.every((k) => x[k] === (r as Row)[k]),
      );
      if (existing) Object.assign(existing, r);
      else this.rows.push(this.withId(r));
    }
    return Promise.resolve();
  }
  update(id: string, patch: Partial<T>): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, patch);
    return Promise.resolve();
  }
  createQueryBuilder(): FakeQueryBuilder {
    const rows: Row[] = this.rows;
    const scoped = (): Row[] => {
      const personId = qb._where?.personId;
      return personId ? rows.filter((r) => r.personId === personId) : rows;
    };
    const qb: FakeQueryBuilder = {
      _where: null,
      select: () => qb,
      addSelect: () => qb,
      where(_sql, params) {
        qb._where = params ?? null;
        return qb;
      },
      andWhere: () => qb,
      groupBy: () => qb,
      orderBy: () => qb,
      getRawMany() {
        const subset = scoped();
        // peakSnapshots shape
        if (
          subset.length &&
          'competencyCode' in subset[0] &&
          'mastery' in subset[0]
        ) {
          const peaks = new Map<string, number>();
          for (const r of subset) {
            const code = r.competencyCode as string;
            peaks.set(
              code,
              Math.max(peaks.get(code) ?? 0, r.mastery as number),
            );
          }
          return Promise.resolve(
            [...peaks].map(([code, peak]) => ({ code, peak })),
          );
        }
        // DISTINCT personId shape
        return Promise.resolve(
          [...new Set(subset.map((r) => r.personId as string))].map(
            (personId) => ({ personId }),
          ),
        );
      },
      getMany: () => Promise.resolve(scoped()),
    };
    return qb;
  }
}

/**
 * AiService stand-in that answers from the mock registry. Responders register
 * when the services' own side-effect imports load, and `mockResponder` looks
 * them up at call time, so a static import is fine here.
 */
export const fakeAi = () => ({
  provider: 'mock' as const,
  defaultModel: 'claude-opus-5',
  fastModel: 'claude-sonnet-5',
  structured<T>(call: AiCall, schema: ZodType<T>): Promise<T> {
    return Promise.resolve(mockResponder<T>(call, schema));
  },
  text(call: AiCall): Promise<AiTextResult> {
    const out = mockResponder<{ text: string }>(
      { ...call, task: `${call.task}#text` },
      undefined,
    );
    return Promise.resolve({ text: out.text, runId: 'run-mock' });
  },
});
