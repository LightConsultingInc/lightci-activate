"use client"

import { Check, Minus } from "lucide-react"
import { Chip } from "../chips"
import { CopyButton } from "../copy-button"
import { MarkdownLite } from "../markdown-lite"
import type { SurfaceState } from "../artifact-editors"
import { hasOutput, SAMPLE_REQUEST_LABELS } from "../artifact-editors"

/** What Claude actually made, by kind: text, three sample-request rows, or the drafted skill. */
export function RunOutput({ surface }: { surface: SurfaceState }) {
  if (!hasOutput(surface)) return null
  return (
    <section className="rounded-xl border bg-card animate-rise" data-testid="run-output" data-kind={surface.kind}>
      {(surface.kind === "prompt" || surface.kind === "project") && (
        <>
          <Header title={surface.kind === "project" ? "What Claude made with your Project" : "What Claude made"} copy={surface.output ?? ""} />
          <div className="max-h-[32rem] overflow-y-auto p-5">
            {surface.output ? <MarkdownLite text={surface.output} /> : <p className="text-sm text-muted-foreground italic">Claude sent nothing back. Try running again.</p>}
          </div>
        </>
      )}
      {surface.kind === "skill" && (
        <>
          <Header title="Your three requests, with the skill in place" />
          <ul className="divide-y">
            {(surface.results ?? []).map((r, i) => (
              <li key={i} className="p-4" data-testid="skill-run-row" data-fired={r.fired}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="eyebrow" data-testid="skill-run-label">{SAMPLE_REQUEST_LABELS[i] ?? `Request ${i + 1}`}</p>
                    <p className="mt-0.5 text-sm font-medium">{r.request}</p>
                  </div>
                  <Chip tone={r.fired ? "pass" : "neutral"} data-testid="skill-fired-chip">
                    {r.fired ? <Check className="size-3" /> : <Minus className="size-3" />} {r.fired ? "fired" : "didn't fire"}
                  </Chip>
                </div>
                <div className="mt-2 max-h-56 overflow-y-auto rounded-md bg-muted/40 p-3 text-sm">
                  {r.output ? <MarkdownLite text={r.output} className="text-sm" /> : <p className="text-muted-foreground italic">No output.</p>}
                </div>
              </li>
            ))}
            {(surface.results ?? []).length === 0 && <li className="p-4 text-sm text-muted-foreground italic">Nothing ran. Check the three requests and try again.</li>}
          </ul>
        </>
      )}
      {surface.kind === "workflow" && (
        <>
          <Header title="The skill drafted from your map" copy={surface.skillDraft ?? ""} />
          <div className="max-h-[32rem] overflow-y-auto p-5">
            {surface.skillDraft ? <pre className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed" data-testid="skill-draft">{surface.skillDraft}</pre> : <p className="text-sm text-muted-foreground italic">No draft came back. Add a step or two and run again.</p>}
          </div>
        </>
      )}
    </section>
  )
}

function Header({ title, copy }: { title: string; copy?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
      <p className="eyebrow">{title}</p>
      {copy ? <CopyButton text={copy} size="xs" testId="copy-output" /> : null}
    </div>
  )
}
