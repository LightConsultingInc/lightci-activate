import type { ContextLayer } from '../context/entities/context-layer.entity';
import type { Person } from '../orgs/entities/person.entity';
import type { WorkflowMap } from '../workflows/entities/workflow-map.entity';

export interface SituationWorkflow {
  name: string;
  minutesPerRun?: number;
  runsPerWeek?: number;
  inputs?: string[];
  outputs?: string[];
  systems?: string[];
  workflowMapId?: string;
}

/** The learner's situation as the Coach sees it: role, responsibilities and weekly workflows (most frequent first). */
export interface LearnerSituation {
  role: string | null;
  responsibilities: string[];
  workflows: SituationWorkflow[];
  systems: string[];
  summary: string | null;
}

/**
 * Merge the person ContextLayer, their WorkflowMaps and Person.profile into one picture. Returns null
 * when nothing is known (no intake yet), so callers can fall back to generic content.
 */
export function buildSituation(
  person: Person,
  layer: ContextLayer | null,
  maps: WorkflowMap[],
): LearnerSituation | null {
  const profile = person.profile ?? {};
  const fromMaps: SituationWorkflow[] = maps.map((m) => ({
    name: m.name,
    minutesPerRun: m.schema?.minutesPerRun,
    runsPerWeek: m.schema?.runsPerWeek,
    inputs: (m.schema?.inputs ?? []).map((i) => i.name),
    outputs: (m.schema?.outputs ?? []).map((o) => o.name),
    systems: m.schema?.systems ?? [],
    workflowMapId: m.id,
  }));
  const seen = new Set(fromMaps.map((w) => w.name.toLowerCase()));
  const add = (names: string[] | undefined): SituationWorkflow[] =>
    (names ?? [])
      .filter((n) => n.trim() && !seen.has(n.toLowerCase()))
      .map((name) => {
        seen.add(name.toLowerCase());
        return { name: name.trim() };
      });
  const workflows = [
    ...fromMaps,
    ...add(profile.weeklyWorkflows),
    ...add(layer?.anchorWorkflows),
  ];
  const responsibilities = profile.responsibilities ?? [];
  if (!layer && responsibilities.length === 0 && workflows.length === 0)
    return null;
  return {
    role: person.title ?? null,
    responsibilities,
    workflows: workflows.sort(
      (a, b) => (b.runsPerWeek ?? 0) - (a.runsPerWeek ?? 0),
    ),
    systems: [
      ...new Set([...(layer?.systems ?? []), ...(profile.systems ?? [])]),
    ],
    summary: layer?.summary ?? null,
  };
}
