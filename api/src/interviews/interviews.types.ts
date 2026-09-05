import type { WorkflowSchema } from '../workflows/entities/workflow-map.entity';
import type { ExerciseSummary } from '../learning/learning.types';
import type { InterviewSession } from './entities/interview-session.entity';

export type InterviewMode = InterviewSession['mode'];

export interface IntakeProfile {
  role: string;
  responsibilities: string[];
  weeklyWorkflows: {
    name: string;
    minutesPerRun: number;
    runsPerWeek: number;
    systems: string[];
  }[];
  claudeUseToday: string;
  selfRatedComfort: number; // 1..5
  sensitivities: string[];
}

/** Champion interview scribe: the team ContextLayer fields plus seed workflows. */
export interface ChampionProfile {
  teamPurpose: string;
  vocabulary: { term: string; meaning: string }[];
  anchorWorkflows: string[];
  sensitivities: string[];
  systems: string[];
  priorities: string[];
  seedWorkflows: {
    name: string;
    purpose: string;
    frequency: WorkflowSchema['frequency'];
    minutesPerRun: number;
    runsPerWeek: number;
    systems: string[];
  }[];
}

export interface InterviewView {
  id: string;
  mode: InterviewMode;
  status: InterviewSession['status'];
  completeness: number;
  transcript: { role: 'interviewer' | 'user'; content: string; at: string }[];
  scribe:
    Partial<WorkflowSchema> | Partial<IntakeProfile> | Partial<ChampionProfile>;
  checkerFlags: { field: string; issue: string }[];
  turnCount: number;
  nextQuestion: string;
  result: Record<string, unknown> | null;
  voice: boolean;
  proposeFinish: boolean;
}

export interface InterviewCompleteResponse {
  interview: InterviewView;
  workflowMapIds: string[];
  placement?: { rung: number; evidence: string[] };
  exercises: ExerciseSummary[];
}
