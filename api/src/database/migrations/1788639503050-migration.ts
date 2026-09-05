import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1788639503050 implements MigrationInterface {
  name = 'Migration1788639503050';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "context_layers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orgId" uuid NOT NULL, "layer" text NOT NULL, "ownerId" uuid, "summary" text, "vocabulary" jsonb NOT NULL DEFAULT '[]', "anchorWorkflows" jsonb NOT NULL DEFAULT '[]', "sensitivities" jsonb NOT NULL DEFAULT '[]', "systems" jsonb NOT NULL DEFAULT '[]', "version" integer NOT NULL DEFAULT '1', "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f2f78bb3b57c6586b9244a797f9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_06cf1537ead0dd845049d66464" ON "context_layers"  ("orgId", "layer", "ownerId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "interview_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orgId" uuid NOT NULL, "personId" uuid NOT NULL, "mode" text NOT NULL, "workflowMapId" uuid, "teamId" uuid, "transcript" jsonb NOT NULL DEFAULT '[]', "scribe" jsonb NOT NULL DEFAULT '{}', "checkerFlags" jsonb NOT NULL DEFAULT '[]', "completeness" real NOT NULL DEFAULT '0', "status" text NOT NULL DEFAULT 'active', "voice" boolean NOT NULL DEFAULT false, "turnCount" integer NOT NULL DEFAULT '0', "result" jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "completedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_8289f4ee665d0b5e283345db49a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d36ec1ff3a7c2b64b7d9dc6ba5" ON "interview_sessions"  ("orgId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5d4819025f7518bd8065b08ebd" ON "interview_sessions"  ("personId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "context_sources" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orgId" uuid NOT NULL, "layer" text NOT NULL, "ownerId" uuid, "type" text NOT NULL, "title" text NOT NULL, "uri" text, "content" text, "reviewState" text NOT NULL DEFAULT 'pending', "tags" jsonb NOT NULL DEFAULT '{}', "ingestedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9464a0d36ea662184154ae03ee7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5af9e795f7b052182114bea67c" ON "context_sources"  ("orgId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0f240d80b11de5b2046209fade" ON "context_sources"  ("ownerId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "coach_notes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "personId" uuid NOT NULL, "note" text NOT NULL, "tags" text array NOT NULL DEFAULT '{}', "author" text NOT NULL DEFAULT 'coach', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_baa899bd1596d0db6d13dc07eb7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_319a601ce07e52ef335fe593ce" ON "coach_notes"  ("personId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "competencies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" text NOT NULL, "rung" integer NOT NULL, "name" text NOT NULL, "description" text NOT NULL, "rubric" jsonb NOT NULL DEFAULT '[]', "orderIndex" integer NOT NULL DEFAULT '0', "minContexts" integer NOT NULL DEFAULT '2', "masteryThreshold" real NOT NULL DEFAULT '0.8', CONSTRAINT "PK_0b29ecda233cc61de0d93527813" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_587d3b9969cac4d2fce8540d7b" ON "competencies"  ("code") `,
    );
    await queryRunner.query(
      `CREATE TABLE "exercises" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "personId" uuid NOT NULL, "rung" integer NOT NULL, "competencyCodes" text array NOT NULL DEFAULT '{}', "title" text NOT NULL, "brief" text NOT NULL, "rationale" text NOT NULL, "kind" text NOT NULL DEFAULT 'artifact', "mode" text NOT NULL DEFAULT 'in_app', "workSurface" text NOT NULL, "contextTag" text, "workflowMapId" uuid, "skillId" uuid, "hints" jsonb NOT NULL DEFAULT '[]', "workedExample" text, "starter" jsonb NOT NULL DEFAULT '{}', "status" text NOT NULL DEFAULT 'queued', "estimatedMinutes" integer NOT NULL DEFAULT '20', "scheduledFor" TIMESTAMP WITH TIME ZONE, "completedAt" TIMESTAMP WITH TIME ZONE, "generatedBy" text NOT NULL DEFAULT 'coach', "hintsRevealed" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c4c46f5fa89a58ba7c2d894e3c3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_228aa39a4675989a45ee2bc2fe" ON "exercises"  ("personId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "grades" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "submissionId" uuid, "skillVersionId" uuid, "personId" uuid NOT NULL, "rubric" jsonb NOT NULL, "score" real NOT NULL, "feedback" text NOT NULL, "decision" text NOT NULL, "critiqueQuality" real, "expectationAccuracy" real, "securityFindings" jsonb NOT NULL DEFAULT '[]', "teachingMoment" text, "graderVersion" text NOT NULL, "model" text, "gradedByPersonId" uuid, "gradedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4740fb6f5df2505a48649f1687b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d9d3e0c4ac49ec8411b52f2fb8" ON "grades"  ("submissionId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_36ccb3824c5e8ac74a9fa8cd1a" ON "grades"  ("skillVersionId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ab5dde2ff621636b167670e502" ON "grades"  ("personId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "mastery_snapshots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "personId" uuid NOT NULL, "competencyCode" text NOT NULL, "day" date NOT NULL, "mastery" real NOT NULL, "components" jsonb NOT NULL, "computedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_fbdcf3fb7a697305889cbf28025" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_7f67012ba65f2bebf7238635d1" ON "mastery_snapshots"  ("personId", "competencyCode", "day") `,
    );
    await queryRunner.query(
      `CREATE TABLE "placements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "personId" uuid NOT NULL, "rung" integer NOT NULL, "by" text NOT NULL, "evidence" jsonb NOT NULL DEFAULT '{}', "placedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_91cca43a1baa03ee278d7be74da" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e257a53f0bd8401abed46d18f3" ON "placements"  ("personId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "revisits" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "personId" uuid NOT NULL, "competencyCode" text NOT NULL, "exerciseId" uuid, "prompt" text NOT NULL, "answerKey" text, "intervalStep" integer NOT NULL DEFAULT '0', "dueAt" TIMESTAMP WITH TIME ZONE NOT NULL, "doneAt" TIMESTAMP WITH TIME ZONE, "score" real, "response" text, "feedback" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7f36e4338ab0380444267da19f1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8153df63d525d4ac044176562a" ON "revisits"  ("personId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c50ec5e451baaa1352ddfd4700" ON "revisits"  ("dueAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "submissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "exerciseId" uuid NOT NULL, "personId" uuid NOT NULL, "attempt" integer NOT NULL DEFAULT '1', "expectationText" text NOT NULL, "expectationConfidence" real NOT NULL, "artifact" jsonb NOT NULL, "critiqueText" text, "coldAttempt" boolean NOT NULL DEFAULT false, "submittedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_10b3be95b8b2fb1e482e07d706b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2049da14f4b00d8615636978c9" ON "submissions"  ("exerciseId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e7ca07986d4b8f0c94b0100d42" ON "submissions"  ("personId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "agent_runs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orgId" uuid, "agent" text NOT NULL, "task" text NOT NULL, "personId" uuid, "input" jsonb NOT NULL DEFAULT '{}', "output" jsonb, "model" text, "inputTokens" integer NOT NULL DEFAULT '0', "outputTokens" integer NOT NULL DEFAULT '0', "durationMs" integer NOT NULL DEFAULT '0', "status" text NOT NULL DEFAULT 'ok', "error" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_442f7e0ec4ae860cf17edc57825" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9cfe60fd8f53f3b228c96cff00" ON "agent_runs"  ("orgId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7bfa47ce14057f74e29c055fe1" ON "agent_runs"  ("agent") `,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orgId" uuid, "actorPersonId" uuid, "action" text NOT NULL, "subjectType" text, "subjectId" uuid, "meta" jsonb NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7a49b489feac17255c58e140ab" ON "audit_log"  ("orgId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "cost_inputs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orgId" uuid NOT NULL, "seatPriceMonthly" real NOT NULL DEFAULT '0', "premiumSeatPriceMonthly" real NOT NULL DEFAULT '0', "loadedHourlyRate" real NOT NULL DEFAULT '0', "lightciFeesMonthly" real NOT NULL DEFAULT '0', "championHoursPerMonth" real NOT NULL DEFAULT '0', "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_daf03385f8ce474e472f9967cae" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_fadd857a8dde5ae47e72739af5" ON "cost_inputs"  ("orgId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "escalations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orgId" uuid NOT NULL, "sourceAgent" text NOT NULL, "kind" text NOT NULL, "subjectType" text NOT NULL, "subjectId" uuid, "reason" text NOT NULL, "assigneePersonId" uuid, "state" text NOT NULL DEFAULT 'open', "slaDueAt" TIMESTAMP WITH TIME ZONE, "resolution" text, "resolvedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_652a394609addaa4b0f2b3032a1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5630f6c0c97b78ab35d34b7aca" ON "escalations"  ("orgId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "readouts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orgId" uuid NOT NULL, "scopeType" text NOT NULL, "scopeId" uuid, "title" text NOT NULL, "periodStart" date NOT NULL, "periodEnd" date NOT NULL, "metrics" jsonb NOT NULL, "narrative" text NOT NULL, "footnotes" jsonb NOT NULL DEFAULT '[]', "exportedAt" TIMESTAMP WITH TIME ZONE, "generatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d4894408ac047ae0e345ed8ccc8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f6098e354857cd133a8d0958a8" ON "readouts"  ("orgId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "usage_snapshots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orgId" uuid NOT NULL, "personId" uuid NOT NULL, "day" date NOT NULL, "metrics" jsonb NOT NULL, "source" text NOT NULL DEFAULT 'seed', CONSTRAINT "PK_c2cf00dd71795744d0f7af78b30" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_73a8d62e9ad0737d95466a979e" ON "usage_snapshots"  ("orgId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4e32a9844eaf0634a0b5db55eb" ON "usage_snapshots"  ("personId", "day") `,
    );
    await queryRunner.query(
      `CREATE TABLE "waves" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orgId" uuid NOT NULL, "name" text NOT NULL, "number" integer NOT NULL, "teamIds" text array NOT NULL DEFAULT '{}', "startsOn" date NOT NULL, "endsOn" date NOT NULL, "targets" jsonb NOT NULL, "status" text NOT NULL DEFAULT 'planned', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b9a2d49cb544011314ff8ce0fd6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0f72dfe92deaee6941c9bee700" ON "waves"  ("orgId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "org_integrations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orgId" uuid NOT NULL, "kind" text NOT NULL, "encryptedSecret" text NOT NULL, "last4" text NOT NULL, "status" text NOT NULL DEFAULT 'unverified', "verifiedAt" TIMESTAMP WITH TIME ZONE, "verificationDetail" text, "config" jsonb NOT NULL DEFAULT '{}', "addedByPersonId" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6d8e4eec41b2f31fb7be5711dac" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ed57dd3cf17348db2a5eaec6a5" ON "org_integrations"  ("orgId", "kind") `,
    );
    await queryRunner.query(
      `CREATE TABLE "orgs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" text NOT NULL, "slug" text NOT NULL, "workosOrganizationId" text, "residencyMode" text NOT NULL DEFAULT 'lightci_hosted', "industry" text, "sponsorName" text, "settings" jsonb NOT NULL DEFAULT '{}', "marketplaceRepo" jsonb, "seats" integer NOT NULL DEFAULT '0', "premiumSeats" integer NOT NULL DEFAULT '0', "isDemo" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9eed8bfad4c9e0dc8648e090efe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ed4cb7ee9ca5967c101d13bea4" ON "orgs"  ("slug") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_97b62679735ba05eaac9487ce1" ON "orgs"  ("workosOrganizationId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "people" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orgId" uuid, "teamId" uuid, "email" text NOT NULL, "name" text NOT NULL, "title" text, "workosUserId" text, "claudeUserId" text, "roles" text array NOT NULL DEFAULT '{learner}', "avatarUrl" text, "status" text NOT NULL DEFAULT 'invited', "onboardedAt" TIMESTAMP WITH TIME ZONE, "consentAt" TIMESTAMP WITH TIME ZONE, "lastActiveAt" TIMESTAMP WITH TIME ZONE, "lastSeenAt" TIMESTAMP WITH TIME ZONE, "premiumSeat" boolean NOT NULL DEFAULT false, "cohortWeek" date, "profile" jsonb NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_aa866e71353ee94c6cc51059c5b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f23a2700c72c7f0e3ecaf6fd62" ON "people"  ("orgId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b0f7b9e93099c7a1e15cf5c956" ON "people"  ("teamId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c77e8752faa45901af2b245dff" ON "people"  ("email") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5fe98315a9e621954aef693f7e" ON "people"  ("workosUserId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "teams" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orgId" uuid NOT NULL, "name" text NOT NULL, "slug" text NOT NULL, "rbacGroupId" text, "pluginName" text, "championPersonId" uuid, "inProgram" boolean NOT NULL DEFAULT true, "purpose" text, "programStartedOn" date, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7e5523774a38b08a6236d322403" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6960121d8b4c385814024db981" ON "teams"  ("orgId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "promotion_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orgId" uuid NOT NULL, "skillId" uuid NOT NULL, "skillVersionId" uuid NOT NULL, "requestedByPersonId" uuid NOT NULL, "prNumber" integer, "prUrl" text, "branch" text, "gradeId" uuid, "boundaryCheck" jsonb NOT NULL, "diffSummary" jsonb NOT NULL DEFAULT '{}', "approvals" jsonb NOT NULL DEFAULT '[]', "requiredApproverRoles" text array NOT NULL DEFAULT '{}', "decision" text NOT NULL DEFAULT 'pending', "decidedAt" TIMESTAMP WITH TIME ZONE, "testResults" text, "highExposure" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_785c7e2cf9ed0c66724ef20d0e6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_14a9b372f50338dbe4f357df01" ON "promotion_requests"  ("orgId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fab28061211650f61d8ca9a7b1" ON "promotion_requests"  ("skillId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "skill_adoptions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "skillId" uuid NOT NULL, "personId" uuid NOT NULL, "exerciseId" uuid, "adoptedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_fbdc69eda126d1cdc39f9611c7e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e620ae64b5792b389a07118661" ON "skill_adoptions"  ("skillId", "personId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "skill_assignments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orgId" uuid NOT NULL, "plugin" text NOT NULL, "teamId" uuid NOT NULL, "intendedMode" text NOT NULL DEFAULT 'available', "observedMode" text, "observedAt" TIMESTAMP WITH TIME ZONE, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_15fd0829a261704eb4e0bad0b83" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_587dd74b96e4ce13ef7391ae3e" ON "skill_assignments"  ("orgId", "plugin", "teamId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "skill_comments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "skillId" uuid NOT NULL, "personId" uuid NOT NULL, "body" text NOT NULL, "kind" text NOT NULL DEFAULT 'feedback', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7263b219d53a8026c393e7f3061" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4e830dc51770fbea651975825b" ON "skill_comments"  ("skillId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "skill_usage" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "skillId" uuid NOT NULL, "personId" uuid NOT NULL, "teamId" uuid, "day" date NOT NULL, "activations" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_47941e035fdbd960e8d1ffc2c5b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3335f508056e5d2594b9c4d3b7" ON "skill_usage"  ("skillId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d549e721fd9845bc3214463b8b" ON "skill_usage"  ("personId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e416f1aeb7d6db6bda5ab53403" ON "skill_usage"  ("skillId", "personId", "day") `,
    );
    await queryRunner.query(
      `CREATE TABLE "skill_versions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "skillId" uuid NOT NULL, "version" integer NOT NULL, "commitSha" text, "tag" text, "skillMd" text NOT NULL, "manifest" jsonb, "changelog" text NOT NULL, "authorPersonId" uuid, "gradeId" uuid, "gradeScore" real, "approverPersonIds" text array NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_5c98dbb0de0ba8fbe6c7e0a768c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_7a3a0840e4deddc77cd96b6b7b" ON "skill_versions"  ("skillId", "version") `,
    );
    await queryRunner.query(
      `CREATE TABLE "skills" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orgId" uuid NOT NULL, "slug" text NOT NULL, "name" text NOT NULL, "triggerLine" text NOT NULL, "plugin" text NOT NULL, "repoPath" text, "ownerPersonId" uuid, "teamId" uuid, "status" text NOT NULL DEFAULT 'draft', "rungRequired" integer NOT NULL DEFAULT '1', "skillMd" text NOT NULL, "boundary" jsonb NOT NULL, "sampleCases" jsonb NOT NULL DEFAULT '[]', "manifest" jsonb, "workflowFamily" text, "workflowMapId" uuid, "latestGradeId" uuid, "currentVersion" integer NOT NULL DEFAULT '0', "branch" text, "successorSkillId" uuid, "forkedFromSkillId" uuid, "authoredBy" text NOT NULL DEFAULT 'builder', "publishedAt" TIMESTAMP WITH TIME ZONE, "lastRegradedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_0d3212120f4ecedf90864d7e298" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7865d2d672ad079ac05ace1f8a" ON "skills"  ("ownerPersonId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9b743688aaa9d9c6017ca7abbc" ON "skills"  ("teamId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_7f2e4d678da859981930941504" ON "skills"  ("orgId", "slug") `,
    );
    await queryRunner.query(
      `CREATE TABLE "baselines" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "personId" uuid NOT NULL, "workflowMapId" uuid, "task" text NOT NULL, "method" text NOT NULL, "minutesPerWeek" real NOT NULL, "reworkMinutesPerWeek" real NOT NULL DEFAULT '0', "approvedByPersonId" uuid, "capturedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6177fb1b69ff49ab766da9e3c7f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0766f616721966d9fbbe8520fb" ON "baselines"  ("personId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "measurements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "personId" uuid NOT NULL, "workflowMapId" uuid, "baselineId" uuid, "task" text NOT NULL, "minutesPerWeek" real NOT NULL, "reworkMinutesPerWeek" real NOT NULL DEFAULT '0', "periodStart" date NOT NULL, "periodEnd" date NOT NULL, "method" text NOT NULL, "source" text NOT NULL DEFAULT 'self', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3c0e7812563f27fd68e8271661b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1a61bc41a1f70b1826aa1bd451" ON "measurements"  ("personId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "workflow_maps" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orgId" uuid NOT NULL, "teamId" uuid, "ownerPersonId" uuid, "name" text NOT NULL, "schema" jsonb NOT NULL, "completeness" real NOT NULL DEFAULT '0', "championVerified" boolean NOT NULL DEFAULT false, "score" jsonb, "status" text NOT NULL DEFAULT 'candidate', "linkedSkillIds" text array NOT NULL DEFAULT '{}', "interviewSessionId" uuid, "nextWave" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8dd73f8c40be08a3059d765c59b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_72d6a923a50cc39ed9753ea2d3" ON "workflow_maps"  ("orgId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3d84eecbffa76314d1f3f9323f" ON "workflow_maps"  ("teamId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1d8966c8a51ade8e861fa9729f" ON "workflow_maps"  ("ownerPersonId") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1d8966c8a51ade8e861fa9729f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3d84eecbffa76314d1f3f9323f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_72d6a923a50cc39ed9753ea2d3"`,
    );
    await queryRunner.query(`DROP TABLE "workflow_maps"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1a61bc41a1f70b1826aa1bd451"`,
    );
    await queryRunner.query(`DROP TABLE "measurements"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0766f616721966d9fbbe8520fb"`,
    );
    await queryRunner.query(`DROP TABLE "baselines"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7f2e4d678da859981930941504"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9b743688aaa9d9c6017ca7abbc"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7865d2d672ad079ac05ace1f8a"`,
    );
    await queryRunner.query(`DROP TABLE "skills"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7a3a0840e4deddc77cd96b6b7b"`,
    );
    await queryRunner.query(`DROP TABLE "skill_versions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e416f1aeb7d6db6bda5ab53403"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d549e721fd9845bc3214463b8b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3335f508056e5d2594b9c4d3b7"`,
    );
    await queryRunner.query(`DROP TABLE "skill_usage"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4e830dc51770fbea651975825b"`,
    );
    await queryRunner.query(`DROP TABLE "skill_comments"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_587dd74b96e4ce13ef7391ae3e"`,
    );
    await queryRunner.query(`DROP TABLE "skill_assignments"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e620ae64b5792b389a07118661"`,
    );
    await queryRunner.query(`DROP TABLE "skill_adoptions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fab28061211650f61d8ca9a7b1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_14a9b372f50338dbe4f357df01"`,
    );
    await queryRunner.query(`DROP TABLE "promotion_requests"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6960121d8b4c385814024db981"`,
    );
    await queryRunner.query(`DROP TABLE "teams"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5fe98315a9e621954aef693f7e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c77e8752faa45901af2b245dff"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b0f7b9e93099c7a1e15cf5c956"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f23a2700c72c7f0e3ecaf6fd62"`,
    );
    await queryRunner.query(`DROP TABLE "people"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_97b62679735ba05eaac9487ce1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ed4cb7ee9ca5967c101d13bea4"`,
    );
    await queryRunner.query(`DROP TABLE "orgs"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ed57dd3cf17348db2a5eaec6a5"`,
    );
    await queryRunner.query(`DROP TABLE "org_integrations"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0f72dfe92deaee6941c9bee700"`,
    );
    await queryRunner.query(`DROP TABLE "waves"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4e32a9844eaf0634a0b5db55eb"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_73a8d62e9ad0737d95466a979e"`,
    );
    await queryRunner.query(`DROP TABLE "usage_snapshots"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f6098e354857cd133a8d0958a8"`,
    );
    await queryRunner.query(`DROP TABLE "readouts"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5630f6c0c97b78ab35d34b7aca"`,
    );
    await queryRunner.query(`DROP TABLE "escalations"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fadd857a8dde5ae47e72739af5"`,
    );
    await queryRunner.query(`DROP TABLE "cost_inputs"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7a49b489feac17255c58e140ab"`,
    );
    await queryRunner.query(`DROP TABLE "audit_log"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7bfa47ce14057f74e29c055fe1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9cfe60fd8f53f3b228c96cff00"`,
    );
    await queryRunner.query(`DROP TABLE "agent_runs"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e7ca07986d4b8f0c94b0100d42"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2049da14f4b00d8615636978c9"`,
    );
    await queryRunner.query(`DROP TABLE "submissions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c50ec5e451baaa1352ddfd4700"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8153df63d525d4ac044176562a"`,
    );
    await queryRunner.query(`DROP TABLE "revisits"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e257a53f0bd8401abed46d18f3"`,
    );
    await queryRunner.query(`DROP TABLE "placements"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7f67012ba65f2bebf7238635d1"`,
    );
    await queryRunner.query(`DROP TABLE "mastery_snapshots"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ab5dde2ff621636b167670e502"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_36ccb3824c5e8ac74a9fa8cd1a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d9d3e0c4ac49ec8411b52f2fb8"`,
    );
    await queryRunner.query(`DROP TABLE "grades"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_228aa39a4675989a45ee2bc2fe"`,
    );
    await queryRunner.query(`DROP TABLE "exercises"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_587d3b9969cac4d2fce8540d7b"`,
    );
    await queryRunner.query(`DROP TABLE "competencies"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_319a601ce07e52ef335fe593ce"`,
    );
    await queryRunner.query(`DROP TABLE "coach_notes"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0f240d80b11de5b2046209fade"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5af9e795f7b052182114bea67c"`,
    );
    await queryRunner.query(`DROP TABLE "context_sources"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5d4819025f7518bd8065b08ebd"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d36ec1ff3a7c2b64b7d9dc6ba5"`,
    );
    await queryRunner.query(`DROP TABLE "interview_sessions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_06cf1537ead0dd845049d66464"`,
    );
    await queryRunner.query(`DROP TABLE "context_layers"`);
  }
}
