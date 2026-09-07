import { Cap, Card, Frame, Mark, Pill, Sub, TONE, TEXT_TONE, MONO, SANS } from "./primitives"

/** The five small questions a clear request answers. */
export function PromptAnatomy() {
  const rows = [
    { label: "Who it's for", ex: "A client who hasn't heard from us in a quarter", tone: "info" as const },
    { label: "What you want", ex: "A two-paragraph update on their portfolio", tone: "glow" as const },
    { label: "What to use", ex: "The attached review notes and last quarter's letter", tone: "claude" as const },
    { label: "What it should look like", ex: "A plain email, no bullet points, under 150 words", tone: "pass" as const },
    { label: "What to avoid", ex: "No performance promises, no jargon", tone: "fail" as const },
  ]
  return (
    <Frame w={640} h={286} label="A clear request answers five questions: who it is for, what you want, what to use, what it should look like, what to avoid">
      {rows.map((r, i) => {
        const y = 16 + i * 52
        return (
          <g key={r.label}>
            <rect x={20} y={y} width={600} height={44} rx={10} style={{ fill: TONE[r.tone], fillOpacity: 0.05, stroke: TONE[r.tone], strokeOpacity: 0.3 }} />
            <rect x={20} y={y + 8} width={3} height={28} rx={1.5} style={{ fill: TONE[r.tone] }} />
            <Cap x={38} y={y + 27} tone={r.tone} anchor="start" size={10}>{r.label}</Cap>
            <text x={250} y={y + 27} fontSize={12} fontFamily={SANS} style={{ fill: TONE.ink, opacity: 0.75 }}>&ldquo;{r.ex}&rdquo;</text>
          </g>
        )
      })}
    </Frame>
  )
}

/** A draft with the lines that need checking called out. */
export function CheckOutput() {
  const lines = [
    { text: "The account grew 12% last year.", state: "check" as const, note: "A number: find the source" },
    { text: "Sarah Kim manages the relationship.", state: "check" as const, note: "A name: confirm it" },
    { text: "The client raised fees in March.", state: "ok" as const, note: "Matches your notes" },
    { text: "Our fund beat every peer.", state: "bad" as const, note: "A claim: where is this from?" },
    { text: "The next review is due in June.", state: "ok" as const, note: "Matches the calendar" },
  ]
  return (
    <Frame w={640} h={250} label="Reading a draft from Claude: numbers, names and claims get checked before you use it">
      <rect x={20} y={16} width={360} height={218} rx={12} style={{ fill: "var(--color-card)", stroke: TONE.ink, strokeOpacity: 0.18 }} />
      <Cap x={38} y={40} tone="muted" anchor="start" size={9.5}>Claude&apos;s draft</Cap>
      {lines.map((l, i) => {
        const y = 72 + i * 34
        return (
          <g key={l.text}>
            <text x={38} y={y} fontSize={12.5} fontFamily={SANS} style={{ fill: TONE.ink, opacity: l.state === "ok" ? 0.7 : 0.9 }}>{l.text}</text>
            {l.state === "ok" && <Mark x={412} y={y - 4} ok />}
            {l.state === "bad" && <Mark x={412} y={y - 4} ok={false} />}
            {l.state === "check" && (
              <g>
                <circle cx={412} cy={y - 4} r={8} style={{ fill: TONE.glow, fillOpacity: 0.2, stroke: TONE.glow, strokeWidth: 1.2 }} />
                <text x={412} y={y} textAnchor="middle" fontSize={10} fontFamily={MONO} fontWeight={600} style={{ fill: TEXT_TONE.glow }}>?</text>
              </g>
            )}
            <Sub x={430} y={y} anchor="start" opacity={0.6}>{l.note}</Sub>
          </g>
        )
      })}
    </Frame>
  )
}

/** Guess first, then look. */
export function PredictThenSee() {
  return (
    <Frame w={640} h={196} label="Write your guess first, then run it and compare with what Claude produced">
      <Card x={20} y={28} w={255} h={118} title="Your guess" lines={["Before you run it, write", "what you think will come back"]} tone="info" />
      <Card x={365} y={28} w={255} h={118} title="What Claude said" lines={["Then run it and read", "the real answer"]} tone="claude" />
      <Pill x={320} y={87} tone="glow" w={84}>compare</Pill>
      <Cap x={320} y={180} tone="muted" size={9.5}>Where they differ is where you learn</Cap>
    </Frame>
  )
}
