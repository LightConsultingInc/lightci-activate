import type { SceneKind } from "@/content/lessons/types"
import { Surfaces, Connectors, PolicyBoundary, FourD, FirstTask } from "./orientation"
import { PromptAnatomy, CheckOutput, PredictThenSee } from "./conversational"
import { ProjectContext, IncludeExclude } from "./projects"
import { SkillTrigger, ProgressiveDisclosure, CanonicalExamples, BoundaryDeclaration } from "./skills"
import { WorkflowMap, BaselineMeasure, PromotionQueue } from "./workflows"
import { ReviewOthers } from "./review"

/** One static picture per scene, plus the sentence a colleague would say while pointing at it. */
const DIAGRAMS: Record<SceneKind, { Draw: () => React.JSX.Element; caption: string }> = {
  surfaces: { Draw: Surfaces, caption: "Four places to work with Claude. Pick by the shape of the task, not by habit." },
  connectors: { Draw: Connectors, caption: "A connector lets Claude read a tool you already use, with your permissions and nothing more." },
  "policy-boundary": { Draw: PolicyBoundary, caption: "Nearly everything you work with is fine to share. Only the few things your firm rules out stay outside the line." },
  "four-d": { Draw: FourD, caption: "Four habits, every time: decide what to hand over, say it plainly, check what comes back, own what you send on." },
  "first-task": { Draw: FirstTask, caption: "Your first exercise is real work: one task, done with Claude, checked by you." },
  "prompt-anatomy": { Draw: PromptAnatomy, caption: "A clear request answers five small questions. Most weak results are missing one of them." },
  "check-output": { Draw: CheckOutput, caption: "Read a draft from Claude the way you would read a new colleague's. Numbers, names and claims get checked." },
  "predict-then-see": { Draw: PredictThenSee, caption: "Guess before you look. The gap between your guess and the result is where the learning is." },
  "project-context": { Draw: ProjectContext, caption: "A Project holds the setup once, so every new chat starts already knowing how you work." },
  "include-exclude": { Draw: IncludeExclude, caption: "Put in what a new colleague would need on day one. Leave out everything else." },
  "skill-trigger": { Draw: SkillTrigger, caption: "A skill wakes up when a request matches its trigger line, and stays quiet otherwise." },
  "progressive-disclosure": { Draw: ProgressiveDisclosure, caption: "Keep the front page short. Put the detail behind it, opened only when a step needs it." },
  "canonical-examples": { Draw: CanonicalExamples, caption: "Two complete examples teach more than twenty rules." },
  "boundary-declaration": { Draw: BoundaryDeclaration, caption: "Before a skill is used, write down what it may read, what it must never receive, and what a person checks first." },
  "workflow-map": { Draw: WorkflowMap, caption: "A workflow on one line: each step, who does it, and which system it reads. The loop is where you send it back." },
  "baseline-measure": { Draw: BaselineMeasure, caption: "Time the task before you change anything, then time it the same way after. The difference is hours back." },
  "promotion-queue": { Draw: PromotionQueue, caption: "A skill moves from draft to published through a review, a sign-off and the library." },
  "review-others": { Draw: ReviewOthers, caption: "Two people run the same checklist. Where they agree, move on. Where they don't, talk." },
}

/** The lesson's picture: a static diagram in the LightCI presentation style with a one-line caption. */
export function LessonDiagram({ scene, className }: { scene: SceneKind; className?: string }) {
  const entry = DIAGRAMS[scene]
  if (!entry) return null
  const { Draw, caption } = entry
  return (
    <figure className={className} data-testid="lesson-diagram" data-scene={scene}>
      <div className="rounded-xl border bg-card p-4 md:p-6">
        <Draw />
      </div>
      <figcaption className="mt-2 px-1 text-sm text-muted-foreground">{caption}</figcaption>
    </figure>
  )
}
