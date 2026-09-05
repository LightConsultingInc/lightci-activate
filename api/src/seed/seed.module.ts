import { Module } from '@nestjs/common';
import { SeedController } from './seed.controller';
import { SeedService } from './seed.service';

/**
 * Demo seed for Meridian Wealth Partners. `SeedService.run()` is idempotent and runs on boot
 * when SEED_ON_BOOT=true; `POST /api/admin/seed/reset` truncates every entity table and reseeds.
 * Uses the DataSource directly, so no TypeOrmModule.forFeature is needed here.
 */
@Module({
  controllers: [SeedController],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
