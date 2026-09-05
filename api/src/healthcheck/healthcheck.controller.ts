import { Controller, Get } from '@nestjs/common';

export interface HealthResponse {
  status: string;
}

@Controller('health')
export class HealthcheckController {
  @Get()
  getHealth(): HealthResponse {
    return { status: 'ok' };
  }
}
