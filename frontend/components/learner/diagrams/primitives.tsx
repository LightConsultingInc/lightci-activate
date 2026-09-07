/**
 * Shared drawing primitives for lesson diagrams, in the LightCI presentation style: mono small-caps
 * labels with a fainter sub-line, tinted circle nodes, thin connectors under a soft glow, a serif
 * word where the picture has a centre. Static on purpose (no motion). Colours come from the theme
 * tokens so the same drawing works on paper and in dark mode.
 */
import type { ReactNode } from "react"

export const MONO = "var(--font-mono), ui-monospace, SFMono-Regular, monospace"
export const SERIF = "var(--font-display), Georgia, serif"
export const SANS = "var(--font-sans), system-ui, sans-serif"

export type Tone = "glow" | "info" | "pass" | "fail" | "claude" | "violet" | "ink" | "muted"
export const TONE: Record<Tone, string> = {
  glow: "var(--color-glow)",
  info: "var(--color-info)",
  pass: "var(--color-pass)",
  fail: "var(--color-fail)",
  claude: "var(--color-claude)",
  violet: "var(--color-rung-5)",
  ink: "var(--color-foreground)",
  muted: "var(--color-muted-foreground)",
}
/** Text drawn in the glow tone needs the darker glow-foreground to stay legible on paper. */
export const TEXT_TONE: Record<Tone, string> = { ...TONE, glow: "var(--color-glow-foreground)" }

/** A mono, letter-spaced, upper-case label. */
export function Cap({ x, y, children, tone = "ink", anchor = "middle", size = 10.5, opacity = 1 }: { x: number; y: number; children: ReactNode; tone?: Tone; anchor?: "start" | "middle" | "end"; size?: number; opacity?: number }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} fontFamily={MONO} letterSpacing="1.6" style={{ fill: TEXT_TONE[tone], opacity, textTransform: "uppercase" }}>
      {children}
    </text>
  )
}

/** The quieter second line under a label. */
export function Sub({ x, y, children, anchor = "middle", size = 10.5, opacity = 0.55 }: { x: number; y: number; children: ReactNode; anchor?: "start" | "middle" | "end"; size?: number; opacity?: number }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} fontFamily={SANS} style={{ fill: TONE.ink, opacity }}>
      {children}
    </text>
  )
}

/** A serif word, for the one thing the picture is about. */
export function Word({ x, y, children, size = 15, tone = "ink", anchor = "middle" }: { x: number; y: number; children: ReactNode; size?: number; tone?: Tone; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} fontFamily={SERIF} style={{ fill: TEXT_TONE[tone] }}>
      {children}
    </text>
  )
}

/** A tinted node: soft disc, ring and a solid centre. */
export function Dot({ x, y, tone = "glow", r = 9 }: { x: number; y: number; tone?: Tone; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} style={{ fill: TONE[tone], fillOpacity: 0.14, stroke: TONE[tone], strokeWidth: 1.25 }} />
      <circle cx={x} cy={y} r={r * 0.36} style={{ fill: TONE[tone] }} />
    </g>
  )
}

/** A numbered node, for ordered steps. */
export function NumDot({ x, y, n, tone = "glow" }: { x: number; y: number; n: number; tone?: Tone }) {
  return (
    <g>
      <circle cx={x} cy={y} r={13} style={{ fill: "var(--color-card)", stroke: TONE[tone], strokeWidth: 2 }} />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontFamily={MONO} style={{ fill: TEXT_TONE[tone] }}>{n}</text>
    </g>
  )
}

/** A connector with a faint glow underneath. Optional arrowhead. */
export function Line({ d, tone = "ink", arrow = false, dashed = false, opacity = 0.7, width = 1.5 }: { d: string; tone?: Tone; arrow?: boolean; dashed?: boolean; opacity?: number; width?: number }) {
  return (
    <g>
      <path d={d} fill="none" style={{ stroke: TONE[tone], strokeOpacity: 0.12, strokeWidth: 5 }} filter="url(#dg-glow)" />
      <path d={d} fill="none" strokeLinecap="round" strokeDasharray={dashed ? "3 5" : undefined} markerEnd={arrow ? `url(#dg-arrow-${tone})` : undefined} style={{ stroke: TONE[tone], strokeOpacity: opacity, strokeWidth: width }} />
    </g>
  )
}

/** A rounded box with a title and up to two lines of quieter text. */
export function Card({ x, y, w, h, title, lines = [], tone = "ink", strong = false }: { x: number; y: number; w: number; h: number; title: ReactNode; lines?: string[]; tone?: Tone; strong?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={12} style={{ fill: TONE[tone], fillOpacity: strong ? 0.12 : 0.05, stroke: TONE[tone], strokeOpacity: strong ? 0.7 : 0.35, strokeWidth: 1.25 }} />
      <Cap x={x + 14} y={y + 22} tone={tone} anchor="start">{title}</Cap>
      {lines.map((l, i) => (
        <Sub key={i} x={x + 14} y={y + 42 + i * 16} anchor="start" opacity={0.62}>{l}</Sub>
      ))}
    </g>
  )
}

/** A small pill label. */
export function Pill({ x, y, children, tone = "ink", w }: { x: number; y: number; children: string; tone?: Tone; w?: number }) {
  const width = w ?? children.length * 6.6 + 26
  return (
    <g>
      <rect x={x - width / 2} y={y - 12} width={width} height={24} rx={12} style={{ fill: "var(--color-card)", stroke: TONE[tone], strokeOpacity: 0.6, strokeWidth: 1.2 }} />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontFamily={SANS} fontWeight={500} style={{ fill: TEXT_TONE[tone] }}>{children}</text>
    </g>
  )
}

/** A tick or a cross, for pass / stop marks. */
export function Mark({ x, y, ok }: { x: number; y: number; ok: boolean }) {
  const tone: Tone = ok ? "pass" : "fail"
  return (
    <g>
      <circle cx={x} cy={y} r={8} style={{ fill: TONE[tone], fillOpacity: 0.15, stroke: TONE[tone], strokeWidth: 1.2 }} />
      {ok ? (
        <path d={`M${x - 3.5} ${y} l2.5 2.5 l4.5 -5`} fill="none" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: TONE[tone] }} />
      ) : (
        <path d={`M${x - 3} ${y - 3} l6 6 M${x + 3} ${y - 3} l-6 6`} fill="none" strokeWidth={1.8} strokeLinecap="round" style={{ stroke: TONE[tone] }} />
      )}
    </g>
  )
}

/** The SVG frame every diagram uses: viewBox, defs (glow filter + one arrowhead per tone), scroll on narrow screens. */
export function Frame({ w, h, children, label, minWidth = 560 }: { w: number; h: number; children: ReactNode; label: string; minWidth?: number }) {
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="h-auto w-full" style={{ minWidth }}>
        <defs>
          <filter id="dg-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          {(Object.keys(TONE) as Tone[]).map((t) => (
            <marker key={t} id={`dg-arrow-${t}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" style={{ fill: TONE[t], fillOpacity: 0.85 }} />
            </marker>
          ))}
        </defs>
        {children}
      </svg>
    </div>
  )
}
