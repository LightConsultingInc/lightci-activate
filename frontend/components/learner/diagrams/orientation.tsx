import { Cap, Card, Dot, Frame, Line, Mark, NumDot, Pill, Sub, Word } from "./primitives"

/** Four surfaces as doors off one question. */
export function Surfaces() {
  const doors = [
    { title: "Chat", lines: ["A question or a", "one-off task"], tone: "glow" as const },
    { title: "Projects", lines: ["A repeated task,", "same setup each time"], tone: "info" as const },
    { title: "Claude Code", lines: ["Work that lives in", "files and code"], tone: "violet" as const },
    { title: "Cowork", lines: ["A longer job you", "hand off in steps"], tone: "claude" as const },
  ]
  return (
    <Frame w={640} h={214} label="Four ways to work with Claude, chosen by the shape of the task">
      <Word x={320} y={30}>What are you trying to get done?</Word>
      {doors.map((d, i) => {
        const x = 6 + i * 160
        const cx = x + 74
        return (
          <g key={d.title}>
            <Line d={`M320 40 C 320 70, ${cx} 70, ${cx} 96`} tone={d.tone} arrow opacity={0.5} />
            <Card x={x} y={100} w={148} h={96} title={d.title} lines={d.lines} tone={d.tone} />
          </g>
        )
      })}
    </Frame>
  )
}

/** Claude reading your tools through connectors, behind your own permissions. */
export function Connectors() {
  const tools = ["Salesforce", "Google Drive", "Gong", "Confluence"]
  return (
    <Frame w={640} h={262} label="Claude reads your firm's tools through connectors, with your permissions">
      <Dot x={70} y={130} tone="ink" r={11} />
      <Cap x={70} y={168}>You</Cap>
      <Sub x={70} y={184} opacity={0.5}>ask in plain words</Sub>
      <Line d="M86 130 L222 130" tone="ink" arrow opacity={0.5} />

      <circle cx={270} cy={130} r={44} style={{ fill: "var(--color-claude)", fillOpacity: 0.1, stroke: "var(--color-claude)", strokeOpacity: 0.6, strokeWidth: 1.25 }} />
      <Word x={270} y={135} tone="claude">Claude</Word>
      <Sub x={270} y={196} opacity={0.5}>reads, then answers</Sub>

      <Line d="M410 44 L410 216" tone="glow" dashed opacity={0.8} />
      <Cap x={410} y={32} tone="glow">Your permissions</Cap>

      {tools.map((t, i) => {
        const y = 70 + i * 40
        return (
          <g key={t}>
            <Line d={`M314 130 C 360 130, 380 ${y}, 470 ${y}`} tone="glow" arrow opacity={0.55} />
            <Pill x={545} y={y} tone="ink">{t}</Pill>
          </g>
        )
      })}
      <Sub x={545} y={242} opacity={0.5}>only what you could open yourself</Sub>
    </Frame>
  )
}

/** What passes to Claude and the few things that stop at the firm's line. */
export function PolicyBoundary() {
  const fine = ["Meeting notes", "A client email", "A spreadsheet", "A call transcript"]
  const out = ["Card numbers", "Health records"]
  return (
    <Frame w={640} h={266} label="Most work is fine to share; only the classes your firm rules out stop at the line">
      <Cap x={110} y={34} tone="pass">Fine to share</Cap>
      {fine.map((f, i) => {
        const y = 56 + i * 32
        return (
          <g key={f}>
            <Pill x={110} y={y} tone="pass" w={150}>{f}</Pill>
            <Line d={`M190 ${y} C 320 ${y}, 380 140, 500 140`} tone="pass" arrow opacity={0.45} />
          </g>
        )
      })}
      <Cap x={110} y={188} tone="fail">Your firm rules out</Cap>
      {out.map((f, i) => {
        const y = 210 + i * 32
        return (
          <g key={f}>
            <Pill x={110} y={y} tone="fail" w={150}>{f}</Pill>
            <Line d={`M190 ${y} L392 ${y}`} tone="fail" opacity={0.45} />
            <Mark x={400} y={y} ok={false} />
          </g>
        )
      })}
      <Sub x={320} y={262} opacity={0.45} anchor="middle">…and whatever else is on your firm&apos;s short list</Sub>

      <Line d="M400 30 L400 190" tone="ink" dashed opacity={0.5} />
      <Cap x={400} y={20}>Your firm&apos;s line</Cap>

      <circle cx={548} cy={140} r={42} style={{ fill: "var(--color-claude)", fillOpacity: 0.1, stroke: "var(--color-claude)", strokeOpacity: 0.6, strokeWidth: 1.25 }} />
      <Word x={548} y={145} tone="claude">Claude</Word>
    </Frame>
  )
}

/** The four habits as a loop. */
export function FourD() {
  const cx = 320, cy = 150, r = 100
  const nodes = [
    { label: "Delegation", sub: "decide what to hand over", x: cx, y: cy - r, tone: "glow" as const },
    { label: "Description", sub: "say what you want, plainly", x: cx + r, y: cy, tone: "info" as const },
    { label: "Discernment", sub: "check what comes back", x: cx, y: cy + r, tone: "pass" as const },
    { label: "Diligence", sub: "own what you send on", x: cx - r, y: cy, tone: "violet" as const },
  ]
  const arcs = [
    `M${cx + 12} ${cy - r + 1} A${r} ${r} 0 0 1 ${cx + r - 1} ${cy - 12}`,
    `M${cx + r - 1} ${cy + 12} A${r} ${r} 0 0 1 ${cx + 12} ${cy + r - 1}`,
    `M${cx - 12} ${cy + r - 1} A${r} ${r} 0 0 1 ${cx - r + 1} ${cy + 12}`,
    `M${cx - r + 1} ${cy - 12} A${r} ${r} 0 0 1 ${cx - 12} ${cy - r + 1}`,
  ]
  return (
    <Frame w={640} h={300} label="Four habits in a loop: delegation, description, discernment, diligence">
      <circle cx={cx} cy={cy} r={r} fill="none" style={{ stroke: "var(--color-foreground)", strokeOpacity: 0.06, strokeDasharray: "2 5" }} />
      {arcs.map((d, i) => <Line key={i} d={d} tone={nodes[i].tone} arrow opacity={0.6} width={2} />)}
      {nodes.map((n) => <Dot key={n.label} x={n.x} y={n.y} tone={n.tone} r={10} />)}
      <Cap x={cx} y={22} tone="glow">{nodes[0].label}</Cap>
      <Sub x={cx} y={38}>{nodes[0].sub}</Sub>
      <Cap x={cx + r + 22} y={cy - 2} tone="info" anchor="start">{nodes[1].label}</Cap>
      <Sub x={cx + r + 22} y={cy + 14} anchor="start">{nodes[1].sub}</Sub>
      <Cap x={cx} y={cy + r + 30} tone="pass">{nodes[2].label}</Cap>
      <Sub x={cx} y={cy + r + 46}>{nodes[2].sub}</Sub>
      <Cap x={cx - r - 22} y={cy - 2} tone="violet" anchor="end">{nodes[3].label}</Cap>
      <Sub x={cx - r - 22} y={cy + 14} anchor="end">{nodes[3].sub}</Sub>
      <Word x={cx} y={cy - 2} size={14}>Every time</Word>
      <Sub x={cx} y={cy + 14} opacity={0.5}>you hand Claude a task</Sub>
    </Frame>
  )
}

/** The first exercise: one real task in three steps. */
export function FirstTask() {
  const steps = [
    { label: "Pick one task", sub: "something you did this week" },
    { label: "Ask Claude to do it", sub: "your words, your material" },
    { label: "Check it", sub: "like a colleague's draft" },
  ]
  return (
    <Frame w={640} h={160} label="Your first exercise: pick one real task, ask Claude to do it, check the result">
      {steps.map((s, i) => {
        const x = 110 + i * 210
        return (
          <g key={s.label}>
            {i < steps.length - 1 && <Line d={`M${x + 18} 70 L${x + 192} 70`} tone="glow" arrow opacity={0.6} />}
            <NumDot x={x} y={70} n={i + 1} />
            <Cap x={x} y={30} tone="glow">{s.label}</Cap>
            <Sub x={x} y={46}>{s.sub}</Sub>
          </g>
        )
      })}
      <Cap x={320} y={130} tone="muted" size={9.5}>About twenty minutes · a real result · that&apos;s the whole exercise</Cap>
    </Frame>
  )
}
