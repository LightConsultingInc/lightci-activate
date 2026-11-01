import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstanceSetting } from '../license/entities/instance-setting.entity';
import { UpdateCheckService } from './update-check.service';
import { UpdatesController } from './updates.controller';
import { UpdatesJobs } from './updates.jobs';

/** Update awareness for self-hosted installs: a daily read of the release index, an admin banner. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([InstanceSetting])],
  controllers: [UpdatesController],
  providers: [UpdateCheckService, UpdatesJobs],
  exports: [UpdateCheckService],
})
export class UpdatesModule {}
