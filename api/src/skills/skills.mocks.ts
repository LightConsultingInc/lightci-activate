/**
 * Deterministic stand-in for the Promoter's Claude task (AI_PROVIDER=mock). Derives a schema-valid
 * approval pack from `call.mockSeed`, which PromoterService always populates.
 */
import type { AiCall } from '../ai/ai.service';
import { registerMockResponder } from '../ai/mock-responders';
import type { PromoterPackageOutput } from './ai-schemas';
import type { BoundaryCheck } from './entities/promotion-request.entity';
import type { SampleCase } from './entities/skill.entity';

interface PromoterSeed {
  slug?: string;
  name?: string;
  triggerLine?: string;
  version?: number;
  gradeScore?: number;
  gradeDecision?: string;
  boundaryCheck?: BoundaryCheck;
  highExposure?: boolean;
  diffSummary?: string;
  sampleCases?: SampleCase[];
  humanReview?: string[];
}

registerMockResponder(
  'promoter.package',
  (call: AiCall): PromoterPackageOutput => {
    const s = (call.mockSeed ?? {}) as PromoterSeed;
    const name = s.name ?? s.slug ?? 'skill';
    const cases = s.sampleCases ?? [];
    const bc = s.boundaryCheck;
    const risks: string[] = [];
    if (bc?.touchesRestrictedClasses?.length)
      risks.push(
        `Reads restricted class(es) ${bc.touchesRestrictedClasses.join(', ')}; compliance sign-off is required before merge.`,
      );
    if (bc?.missingDeclarations?.length)
      risks.push(
        `must_never_receive omits ${bc.missingDeclarations.join(', ')} although the skill text refers to them.`,
      );
    if (s.highExposure && !bc?.touchesRestrictedClasses?.length)
      risks.push(
        'A human-review step touches CRM / system-of-record entry; confirm the skill never writes to the system itself.',
      );
    if (!cases.some((c) => c.shouldTrigger === 'no'))
      risks.push(
        'No should-not-trigger sample case supplied; over-triggering cannot be judged.',
      );
    if ((s.gradeScore ?? 1) < 0.9)
      risks.push(
        `Grader score ${Math.round((s.gradeScore ?? 0) * 100)}% is a pass but below the 90% comfort line; read the weakest rubric notes.`,
      );
    const testResults = cases.length
      ? cases
          .map((c, i) => {
            const would =
              c.shouldTrigger === 'yes'
                ? 'would trigger'
                : c.shouldTrigger === 'no'
                  ? 'would not trigger'
                  : 'triggers with a caveat';
            return `${i + 1}. [${c.shouldTrigger}] "${c.input.slice(0, 90)}${c.input.length > 90 ? '…' : ''}" → ${would}; behaves as expected (${c.expected.slice(0, 80)}${c.expected.length > 80 ? '…' : ''}).`;
          })
          .join('\n') +
        `\n${cases.length}/${cases.length} cases behave as the author expects (reasoned from the skill text; not executed).`
      : 'No sample cases supplied; nothing to evaluate.';
    const approvalSummary = [
      `${name} v${s.version ?? 1}: ${s.triggerLine ?? 'no trigger line supplied'}`,
      `Change: ${s.diffSummary ?? 'new skill'}.`,
      `Grader: ${s.gradeDecision ?? 'pass'} at ${Math.round((s.gradeScore ?? 0.86) * 100)}%.`,
      `Boundary: ${bc?.ok ? 'complete' : 'gaps found'}${bc?.notes ? ` — ${bc.notes}` : ''}`,
      `Human review: ${(s.humanReview ?? []).join(', ') || 'none declared'}.`,
      `Approvers needed: champion${s.highExposure ? ' + compliance' : ''}.`,
    ].join('\n');
    return { approvalSummary, risks, testResults };
  },
);
