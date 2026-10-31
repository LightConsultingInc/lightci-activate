import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

export type ReadyState = 'ok' | 'fail' | 'pending' | 'current' | 'n/a';

export interface ReadinessReport {
  status: 'ok' | 'fail';
  db: 'ok' | 'fail';
  migrations: 'current' | 'pending' | 'unknown';
  license: 'valid' | 'n/a';
}

/** The subset of DataSource readiness needs; narrow so tests can fake it. */
export interface ReadinessDataSource {
  query(sql: string): Promise<unknown>;
  showMigrations(): Promise<boolean>;
}

/**
 * Readiness answers "may traffic be routed here?": the database answers, the
 * schema is at the version this build expects, and (self-hosted, later) the
 * license is valid. Liveness (`/api/health`) stays a bare process check.
 */
@Injectable()
export class ReadinessService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  check(): Promise<ReadinessReport> {
    return ReadinessService.evaluate(this.ds);
  }

  static async evaluate(ds: ReadinessDataSource): Promise<ReadinessReport> {
    const report: ReadinessReport = {
      status: 'ok',
      db: 'ok',
      migrations: 'current',
      license: 'n/a',
    };
    try {
      await ds.query('SELECT 1');
    } catch {
      report.db = 'fail';
      report.migrations = 'unknown';
      report.status = 'fail';
      return report;
    }
    try {
      const pending = await ds.showMigrations();
      if (pending) {
        report.migrations = 'pending';
        report.status = 'fail';
      }
    } catch {
      report.migrations = 'unknown';
      report.status = 'fail';
    }
    return report;
  }
}
