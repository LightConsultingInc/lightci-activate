import { Cap, Dot, Frame, Line, Pill, Sub, TONE } from "./primitives"

/** A workflow on one line: steps, who does each, which system it reads, and the loop back. */
export function WorkflowMap() {
  const steps = [
    { x: 110, label: "Pull the notes", who: "You", sys: "Salesforce · Gong", tone: "info" as const },
    { x: 250, label: "Draft the update", who: "Claude", sys: "—", tone: "claude" as const },
    { x: 390, label: "Good enough?", who: "You", sys: "—", tone: "glow" as const, decision: true },
    { x: 540, label: "Send it", who: "You", sys: "Outlook", tone: "pass" as const },
  ]
  return (
    <Frame w={640} h={296} label="A workflow: each step, who does it, which system it reads, and where work loops back">
      {steps.map((s, i) => (
        <g key={s.label}>
          {i < steps.length - 1 && <Line d={`M${s.x + 16} 92 L${steps[i + 1].x - 16} 92`} tone={s.tone} arrow opacity={0.55} />}
          {s.decision ? (
            <polygon points={`${s.x},78 ${s.x + 14},92 ${s.x},106 ${s.x - 14},92`} style={{ fill: TONE[s.tone], fillOpacity: 0.14, stroke: TONE[s.tone], strokeWidth: 1.25 }} />
          ) : (
            <Dot x={s.x} y={92} tone={s.tone} />
          )}
          <Cap x={s.x} y={44} tone={s.tone} size={10}>{s.label}</Cap>
          <Pill x={s.x} y={150} tone={s.who === "Claude" ? "claude" : "ink"} w={s.who === "Claude" ? 70 : 48}>{s.who}</Pill>
          <Sub x={s.x} y={276} opacity={0.6}>{s.sys}</Sub>
        </g>
      ))}
      <Cap x={12} y={154} tone="muted" size={9} anchor="start">Who</Cap>
      <Cap x={12} y={280} tone="muted" size={9} anchor="start">Reads</Cap>
      {/* the loop back when it is not good enough */}
      <Line d="M390 108 L390 196" tone="fail" opacity={0.5} />
      <rect x={305} y={196} width={170} height={40} rx={10} style={{ fill: TONE.fail, fillOpacity: 0.06, stroke: TONE.fail, strokeOpacity: 0.45 }} />
      <Cap x={390} y={221} tone="fail" size={9.5}>Say what&apos;s off, run again</Cap>
      <Line d="M305 216 C 240 216, 250 160, 250 110" tone="fail" arrow opacity={0.5} />
      <Cap x={405} y={190} tone="fail" size={9} anchor="start">no</Cap>
      <Cap x={465} y={86} tone="pass" size={9}>yes</Cap>
    </Frame>
  )
}

/** Before and after bars with the hours back between them. */
export function BaselineMeasure() {
  return (
    <Frame w={640} h={214} label="Time the task before you change anything, then again the same way after; the difference is hours back">
      <Cap x={320} y={28} tone="muted" size={9.5}>The same task, timed the same way, twice</Cap>
      <Cap x={110} y={72} tone="ink" anchor="end">Before</Cap>
      <rect x={130} y={58} width={380} height={20} rx={6} style={{ fill: TONE.ink, fillOpacity: 0.12 }} />
      <Sub x={520} y={73} anchor="start" opacity={0.7}>about 3 hours a week</Sub>
      <Cap x={110} y={126} tone="pass" anchor="end">After</Cap>
      <rect x={130} y={112} width={116} height={20} rx={6} style={{ fill: TONE.pass, fillOpacity: 0.35, stroke: TONE.pass, strokeOpacity: 0.7 }} />
      <Sub x={256} y={127} anchor="start" opacity={0.7}>about 50 minutes</Sub>
      <path d="M248 148 L248 156 L510 156 L510 148" fill="none" style={{ stroke: TONE.glow, strokeWidth: 1.2, strokeOpacity: 0.8 }} />
      <Cap x={379} y={176} tone="glow">Hours back · about 2 hours a week</Cap>
      <Sub x={320} y={204} opacity={0.5}>Count the fixing-up time too, both times, or the number lies.</Sub>
    </Frame>
  )
}

/** Draft → reviewed → approved → published. */
export function PromotionQueue() {
  const stages = [
    { label: "Draft", sub: "you wrote it", tone: "muted" as const },
    { label: "Reviewed", sub: "a colleague checked it", tone: "info" as const },
    { label: "Approved", sub: "your champion signed off", tone: "glow" as const },
    { label: "Published", sub: "the team can use it", tone: "pass" as const },
  ]
  const gates = ["checklist passed", "data rules written down", "in the library"]
  return (
    <Frame w={640} h={172} label="A skill moves from draft to published through a review, a sign-off and the library">
      {stages.map((s, i) => {
        const x = 80 + i * 160
        return (
          <g key={s.label}>
            {i < stages.length - 1 && (
              <>
                <Line d={`M${x + 14} 80 L${x + 146} 80`} tone={s.tone} arrow opacity={0.55} />
                <Sub x={x + 80} y={104} opacity={0.5} size={9.5}>{gates[i]}</Sub>
              </>
            )}
            <Dot x={x} y={80} tone={s.tone} />
            <Cap x={x} y={40} tone={s.tone}>{s.label}</Cap>
            <Sub x={x} y={56}>{s.sub}</Sub>
          </g>
        )
      })}
      <Cap x={320} y={150} tone="muted" size={9.5}>Nothing skips a step · every step is recorded</Cap>
    </Frame>
  )
}
