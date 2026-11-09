import { Cap, Card, Frame, Line, Mark, Sub, Word, TONE, SANS } from "./primitives"

/** A request matching (or not) a skill's trigger line. */
export function SkillTrigger() {
  return (
    <Frame w={640} h={256} label="A skill fires when a request matches its trigger line and stays quiet otherwise">
      <Card x={20} y={40} w={250} h={68} title="Someone asks" lines={["Prep me for tomorrow's", "call with Harbor Trust"]} tone="ink" />
      <Card x={20} y={158} w={250} h={68} title="Someone asks" lines={["Draft the renewal letter", "for Mr Ayers"]} tone="ink" />
      <Line d="M270 74 C 320 74, 330 118, 368 118" tone="pass" arrow opacity={0.7} width={2} />
      <Cap x={318} y={62} tone="pass" size={9.5}>Fires</Cap>
      <Line d="M270 192 C 305 192, 320 175, 342 165" tone="fail" dashed opacity={0.6} />
      <Mark x={350} y={161} ok={false} />
      <Cap x={318} y={222} tone="fail" size={9.5}>Doesn&apos;t match · stays quiet</Cap>
      <Card x={370} y={58} w={250} h={124} title="Skill · meeting prep" lines={["Fires when someone asks to", "prepare for a client meeting.", "Steps, template, checks inside."]} tone="glow" strong />
    </Frame>
  )
}

/** A short front page with references opened only when needed. */
export function ProgressiveDisclosure() {
  const refs = ["templates/update-letter.md", "examples/two-good-ones.md", "checklist.md"]
  return (
    <Frame w={640} h={284} label="Keep the skill's front page short and put the detail behind it, opened only when a step needs it">
      <Card x={20} y={28} w={290} h={222} title="Front page · short" lines={["The job, in one line", "When to use it", "The steps, briefly", "Where the details live  →"]} tone="glow" strong />
      <Cap x={485} y={40} tone="muted" size={9.5}>Opened only when needed</Cap>
      {refs.map((r, i) => {
        const y = 62 + i * 60
        return (
          <g key={r}>
            <Line d={`M310 118 C 340 118, 335 ${y + 22}, 358 ${y + 22}`} tone="ink" dashed opacity={0.4} arrow />
            <rect x={360} y={y} width={250} height={44} rx={10} style={{ fill: "var(--color-card)", stroke: TONE.ink, strokeOpacity: 0.25 }} />
            <text x={376} y={y + 27} fontSize={11.5} fontFamily="var(--font-mono), monospace" style={{ fill: TONE.ink, opacity: 0.7 }}>{r}</text>
          </g>
        )
      })}
      <Cap x={320} y={274} tone="muted" size={9.5}>Short on top · depth behind it</Cap>
    </Frame>
  )
}

/** Two complete examples against a long list of rules. */
export function CanonicalExamples() {
  const rules = ["If the client is new, then…", "If fees come up, then…", "If it's a review, then…", "If they're upset, then…", "If the account is joint, then…", "If they ask about tax, then…", "If they mention a move, then…", "If…"]
  return (
    <Frame w={640} h={280} label="Two complete examples teach more than a long list of rules">
      <Cap x={165} y={34} tone="pass">Two complete examples</Cap>
      <Card x={20} y={48} w={290} h={92} title="Example 1" lines={["In: notes from a fee call", "Out: the finished email"]} tone="pass" strong />
      <Card x={20} y={156} w={290} h={92} title="Example 2" lines={["In: a first meeting", "Out: the finished email"]} tone="pass" strong />
      <Cap x={490} y={34} tone="muted">Twenty rules</Cap>
      {rules.map((r, i) => (
        <text key={r} x={372} y={66 + i * 26} fontSize={12} fontFamily={SANS} style={{ fill: TONE.ink, opacity: Math.max(0.12, 0.6 - i * 0.07) }}>{r}</text>
      ))}
      <Word x={165} y={270} size={13}>Show it done, twice.</Word>
    </Frame>
  )
}

/** May read / must never receive / a person checks first. */
export function BoundaryDeclaration() {
  const cols = [
    { title: "May read", lines: ["Accounts you own", "The team Drive folder", "Meeting notes"], tone: "pass" as const },
    { title: "Must never receive", lines: ["Card numbers", "Health records", "Whatever your firm lists"], tone: "fail" as const },
    { title: "A person checks first", lines: ["Anything sent to a client", "Anything that moves money", "Anything you'd sign"], tone: "glow" as const },
  ]
  return (
    <Frame w={640} h={240} label="Before a skill is used, write down what it may read, what it must never receive, and what a person checks first">
      <Word x={320} y={30} size={14}>Written down before anyone uses the skill</Word>
      {cols.map((c, i) => <Card key={c.title} x={12 + i * 210} y={50} w={196} h={112} title={c.title} lines={c.lines} tone={c.tone} strong />)}
      <Sub x={320} y={200} opacity={0.5}>Three short lists. A reviewer can check them in a minute.</Sub>
    </Frame>
  )
}
