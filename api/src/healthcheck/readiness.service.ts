import { Injectable, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { edition } from '../config/env';
import { LicenseService, type LicenseState } from '../license/license.service';

export type ReadyState = 'ok' | 'fail' | 'pending' | 'current' | 'n/a';

export interface ReadinessReport {
  status: 'ok' | 'fail';
  db: 'ok' | 'fail';
  migrations: 'current' | 'pending' | 'unknown';
  /** The licence state on a self-hosted install ('n/a' in the cloud edition and for the worker's bare check). */
  license: LicenseState['status'];
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
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Optional() private readonly license?: LicenseService,
  ) {}

  /** Readiness stays 200 while the licence is expired: the install serves read-only, which is routable. */
  async check(): Promise<ReadinessReport> {
    const report = await ReadinessService.evaluate(this.ds);
    if (edition() === 'self-hosted' && this.license) {
      const state = await this.license.state().catch(() => null);
      if (state) report.license = state.status;
    }
    return report;
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
