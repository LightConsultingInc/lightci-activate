import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsObject, IsString, Max, Min } from 'class-validator';
import { CurrentUser, OrgId } from '../common/decorators';
import { Person } from '../orgs/entities/person.entity';
import type { LessonCheck, LessonExample } from './entities/lesson-personalisation.entity';
import { LessonsService, type PersonalisedLesson } from './lessons.service';

class PersonaliseLessonDto {
  @IsInt() @Min(0) @Max(5) rung: number;
  @IsString() title: string;
  @IsString() promise: string;
  @IsString() body: string;
  @IsArray() keyPoints: string[];
  @IsObject() example: LessonExample;
  @IsObject() check: LessonCheck;
}

class LessonCheckedDto {
  @IsBoolean() correct: boolean;
}

@ApiTags('Learning')
@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessons: LessonsService) {}

  @Post(':slug/personalised')
  @ApiOperation({ summary: 'Rewrite a lesson\'s example and check for the caller from their own workflows (cached per person+lesson); generic content with personalised=false when nothing is known about them.' })
  async personalised(@CurrentUser() user: Person, @OrgId() orgId: string, @Param('slug') slug: string, @Body() dto: PersonaliseLessonDto): Promise<PersonalisedLesson> {
    return this.lessons.personalise(user, orgId, slug.slice(0, 120), {
      rung: dto.rung,
      title: dto.title,
      promise: dto.promise,
      body: dto.body,
      keyPoints: Array.isArray(dto.keyPoints) ? dto.keyPoints.map(String) : [],
      example: dto.example,
      check: dto.check,
    });
  }

  @Post(':slug/checked')
  @ApiOperation({ summary: 'Record the outcome of a lesson check (feeds the person memory).' })
  async checked(@CurrentUser() user: Person, @OrgId() orgId: string, @Param('slug') slug: string, @Body() dto: LessonCheckedDto): Promise<{ ok: true; memoryVersion: number }> {
    return this.lessons.checked(user, orgId, slug.slice(0, 120), dto.correct);
  }
}
