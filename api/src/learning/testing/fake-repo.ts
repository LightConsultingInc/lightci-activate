/**
 * Minimal in-memory stand-in for a TypeORM Repository, enough for the learning specs:
 * create / save / find / findOne / count / upsert with equality `where` (incl. `In`, `IsNull`, `Not(IsNull())`).
 */
import { randomUUID } from 'node:crypto';
import { FindOperator } from 'typeorm';

type Row = Record<string, any>;

function matches(row: Row, where: Row | Row[] | undefined): boolean {
  if (!where) return true;
  if (Array.isArray(where)) return where.some((w) => matches(row, w));
  return Object.entries(where).every(([k, v]) => {
    const actual = row[k];
    if (v instanceof FindOperator) {
      const type = (v as any).type as string;
      const value = (v as any).value;
      if (type === 'in') return (value as unknown[]).includes(actual);
      if (type === 'isNull') return actual === null || actual === undefined;
      if (type === 'not') {
        const inner = value as FindOperator<unknown>;
        if ((inner as any).type === 'isNull')
          return !(actual === null || actual === undefined);
        return actual !== (inner as any).value;
      }
      if (type === 'lessThanOrEqual') return actual <= value;
      if (type === 'moreThanOrEqual') return actual >= value;
      return true;
    }
    return actual === v;
  });
}

function sortRows(rows: Row[], order?: Record<string, 'ASC' | 'DESC'>): Row[] {
  if (!order) return rows;
  const [[key, dir]] = Object.entries(order);
  return [...rows].sort((a, b) => {
    const x = a[key] instanceof Date ? a[key].getTime() : a[key];
    const y = b[key] instanceof Date ? b[key].getTime() : b[key];
    return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'DESC' ? -1 : 1);
  });
}

export class FakeRepo<T extends Row> {
  rows: T[] = [];
  constructor(seed: Partial<T>[] = []) {
    for (const s of seed) this.rows.push(this.withId(s));
  }
  private withId(s: Partial<T>): T {
    return { id: randomUUID(), createdAt: new Date(), ...s } as unknown as T;
  }
  create(x: Partial<T> | Partial<T>[]): any {
    return Array.isArray(x) ? x.map((y) => ({ ...y })) : { ...x };
  }
  async save(x: any): Promise<any> {
    if (Array.isArray(x)) return Promise.all(x.map((y) => this.save(y)));
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
  async find(
    opts: { where?: any; order?: any; take?: number } = {},
  ): Promise<T[]> {
    let out = sortRows(
      this.rows.filter((r) => matches(r, opts.where)),
      opts.order,
    ) as T[];
    if (opts.take) out = out.slice(0, opts.take);
    return out;
  }
  async findOne(opts: { where?: any; order?: any }): Promise<T | null> {
    return (await this.find(opts))[0] ?? null;
  }
  async count(opts: { where?: any } = {}): Promise<number> {
    return (await this.find(opts)).length;
  }
  async upsert(rows: Partial<T>[], conflict: string[]): Promise<void> {
    for (const r of rows) {
      const existing = this.rows.find((x) =>
        conflict.every((k) => x[k] === (r as Row)[k]),
      );
      if (existing) Object.assign(existing, r);
      else this.rows.push(this.withId(r));
    }
  }
  async update(id: string, patch: Partial<T>): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, patch);
  }
  createQueryBuilder(): any {
    const rows = this.rows;
    const qb: any = {
      _where: null as null | { personId?: string },
      select() {
        return qb;
      },
      addSelect() {
        return qb;
      },
      where(_sql: string, params?: Row) {
        qb._where = params ?? null;
        return qb;
      },
      andWhere() {
        return qb;
      },
      groupBy() {
        return qb;
      },
      orderBy() {
        return qb;
      },
      async getRawMany() {
        const subset = qb._where?.personId
          ? rows.filter((r) => r.personId === qb._where.personId)
          : rows;
        // peakSnapshots shape
        if (
          subset.length &&
          'competencyCode' in subset[0] &&
          'mastery' in subset[0]
        ) {
          const peaks = new Map<string, number>();
          for (const r of subset)
            peaks.set(
              r.competencyCode,
              Math.max(peaks.get(r.competencyCode) ?? 0, r.mastery),
            );
          return [...peaks].map(([code, peak]) => ({ code, peak }));
        }
        // DISTINCT personId shape
        return [...new Set(subset.map((r) => r.personId))].map((personId) => ({
          personId,
        }));
      },
      async getMany() {
        return qb._where?.personId
          ? rows.filter((r) => r.personId === qb._where.personId)
          : rows;
      },
    };
    return qb;
  }
}

export const fakeAi = () => {
  // Lazy import so the mock registry is populated by the services' own side-effect imports.
  const { mockResponder } =
    require('../../ai/mock-responders') as typeof import('../../ai/mock-responders');
  return {
    provider: 'mock' as const,
    defaultModel: 'claude-opus-5',
    fastModel: 'claude-sonnet-5',
    async structured<T>(call: any, schema: any): Promise<T> {
      return mockResponder<T>(call, schema);
    },
    async text(call: any) {
      const out = mockResponder<{ text: string }>(
        { ...call, task: `${call.task}#text` },
        undefined,
      );
      return { text: out.text, runId: 'run-mock' };
    },
  };
};
