import { Cap, Frame, Mark, TONE, SANS } from "./primitives"

/** Two people run the same checklist; the one disagreement is the conversation to have. */
export function ReviewOthers() {
  const rows = [
    { check: "Does one job", you: true, them: true },
    { check: "Says when to use it", you: true, them: true },
    { check: "Two real examples included", you: true, them: true },
    { check: "Data rules written down", you: true, them: false },
    { check: "Tried on a test example", you: true, them: true },
  ]
  return (
    <Frame w={640} h={262} label="Two reviewers run the same checklist; where they disagree is what to talk about">
      <Cap x={420} y={40} tone="ink">You</Cap>
      <Cap x={540} y={40} tone="ink">A colleague</Cap>
      {rows.map((r, i) => {
        const y = 72 + i * 34
        const differ = r.you !== r.them
        return (
          <g key={r.check}>
            {differ && <rect x={20} y={y - 18} width={600} height={32} rx={8} style={{ fill: TONE.glow, fillOpacity: 0.16, stroke: TONE.glow, strokeOpacity: 0.7 }} />}
            <text x={38} y={y} fontSize={12.5} fontFamily={SANS} style={{ fill: TONE.ink, opacity: 0.85 }}>{r.check}</text>
            <Mark x={420} y={y - 4} ok={r.you} />
            <Mark x={540} y={y - 4} ok={r.them} />
          </g>
        )
      })}
      <Cap x={320} y={250} tone="glow" size={9.5}>One disagreement · that is the conversation to have</Cap>
    </Frame>
  )
}
