import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesGuard } from '../common/roles.guard';
import { Org } from '../orgs/entities/org.entity';
import { Person } from '../orgs/entities/person.entity';
import { Team } from '../orgs/entities/team.entity';
import { Placement } from '../learning/entities/placement.entity';
import { AuthController } from './auth.controller';
import { PeopleService } from './people.service';
import { WorkosGuard } from './workos.guard';
import { WorkosService } from './workos.service';

@Module({
  imports: [TypeOrmModule.forFeature([Person, Org, Team, Placement])],
  controllers: [AuthController],
  providers: [
    PeopleService,
    WorkosService,
    WorkosGuard,
    { provide: APP_GUARD, useExisting: WorkosGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [PeopleService, WorkosService, WorkosGuard],
})
export class AuthModule {}
