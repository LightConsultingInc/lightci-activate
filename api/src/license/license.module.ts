import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Person } from '../orgs/entities/person.entity';
import { InstanceSetting } from './entities/instance-setting.entity';
import { LicenseController } from './license.controller';
import { LicenseGuard } from './license.guard';
import { LicenseService } from './license.service';

/** Offline licensing for self-hosted installs; a no-op in the cloud edition. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([InstanceSetting, Person])],
  controllers: [LicenseController],
  providers: [LicenseService, { provide: APP_GUARD, useClass: LicenseGuard }],
  exports: [LicenseService],
})
export class LicenseModule {}
