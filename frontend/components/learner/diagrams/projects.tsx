import { Cap, Card, Frame, Line, Mark, Pill, Sub } from "./primitives"

/** One Project feeding many chats. */
export function ProjectContext() {
  const chats = ["New chat: Monday's call prep", "New chat: the quarterly letter", "New chat: a fee question"]
  return (
    <Frame w={640} h={272} label="A Project holds instructions, files and connected tools once; every new chat starts knowing them">
      <rect x={20} y={36} width={330} height={216} rx={14} style={{ fill: "var(--color-glow)", fillOpacity: 0.07, stroke: "var(--color-glow)", strokeOpacity: 0.7, strokeWidth: 1.25 }} />
      <Cap x={36} y={60} tone="glow" anchor="start">One Project</Cap>
      <Card x={36} y={72} w={298} h={52} title="Instructions" lines={["how you like this task done"]} tone="info" />
      <Card x={36} y={132} w={298} h={52} title="Files" lines={["a summary, a template, two good examples"]} tone="violet" />
      <Card x={36} y={192} w={298} h={52} title="Connected tools" lines={["the team Drive folder, Salesforce"]} tone="claude" />
      <Cap x={520} y={60} tone="muted" size={9.5}>Every chat starts knowing this</Cap>
      {chats.map((c, i) => {
        const y = 100 + i * 56
        return (
          <g key={c}>
            <Line d={`M350 ${y} C 385 ${y}, 385 ${y}, 418 ${y}`} tone="glow" arrow opacity={0.55} />
            <Pill x={520} y={y} tone="ink" w={200}>{c}</Pill>
          </g>
        )
      })}
    </Frame>
  )
}

/** A pile of material pruned to what a new colleague would need. */
export function IncludeExclude() {
  const items = [
    { label: "The 80-page policy", keep: false },
    { label: "A one-page summary", keep: true },
    { label: "Last year's version", keep: false },
    { label: "Your template", keep: true },
    { label: "A whole email inbox", keep: false },
    { label: "Two good past examples", keep: true },
  ]
  let kept = 0
  return (
    <Frame w={640} h={272} label="Put in what a new colleague would need on day one; leave the rest out">
      <Cap x={110} y={26} tone="muted" size={9.5}>Everything you could add</Cap>
      <Cap x={520} y={26} tone="pass" size={9.5}>What goes in</Cap>
      <Line d="M320 40 L320 256" tone="ink" dashed opacity={0.35} />
      <Sub x={320} y={268} opacity={0.5}>would a new colleague need it on day one?</Sub>
      {items.map((it, i) => {
        const y = 52 + i * 38
        const ty = 70 + kept * 60
        if (it.keep) kept += 1
        return (
          <g key={it.label}>
            <Pill x={110} y={y} tone={it.keep ? "pass" : "muted"} w={176}>{it.label}</Pill>
            {it.keep ? (
              <>
                <Line d={`M200 ${y} C 300 ${y}, 340 ${ty}, 428 ${ty}`} tone="pass" arrow opacity={0.5} />
                <Pill x={520} y={ty} tone="pass" w={176}>{it.label}</Pill>
              </>
            ) : (
              <Mark x={212} y={y} ok={false} />
            )}
          </g>
        )
      })}
    </Frame>
  )
}
