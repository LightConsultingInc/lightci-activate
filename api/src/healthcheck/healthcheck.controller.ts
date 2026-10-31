import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/decorators';
import { ReadinessService, type ReadinessReport } from './readiness.service';

export interface HealthResponse {
  status: string;
}

/**
 * `/api/health` is liveness: the process is serving.
 * `/api/ready` is readiness: database reachable and schema current; 503 otherwise.
 * Both are public and excluded from access logs.
 */
@Public()
@Controller()
export class HealthcheckController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get('health')
  getHealth(): HealthResponse {
    return { status: 'ok' };
  }

  @Get('ready')
  async getReady(
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReadinessReport> {
    const report = await this.readiness.check();
    res.status(report.status === 'ok' ? 200 : 503);
    return report;
  }
}
