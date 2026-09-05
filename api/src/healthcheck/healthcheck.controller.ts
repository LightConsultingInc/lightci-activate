import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators';

export interface HealthResponse {
  status: string;
}

@Public()
@Controller('health')
export class HealthcheckController {
  @Get()
  getHealth(): HealthResponse {
    return { status: 'ok' };
  }
}
