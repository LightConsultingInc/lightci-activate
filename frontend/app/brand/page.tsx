import { ActivateLockup, LightciWordmark } from "@/components/brand/logo"
import { Paper } from "@/components/brand/grain"
import { RungBadge, RungRing, RUNGS } from "@/components/brand/rung"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = { title: "Brand · Activate" }

const swatches = [
  ["Ink", "bg-ink text-paper"], ["Paper", "bg-paper text-ink border"], ["Glow", "bg-glow text-glow-foreground"], ["Glow soft", "bg-glow-soft text-glow-foreground"],
  ["Pass", "bg-pass text-white"], ["Revise", "bg-revise text-ink"], ["Fail", "bg-fail text-white"], ["Info", "bg-info text-white"], ["Claude", "bg-claude text-white"],
]

/** Public style guide: tokens, type, brand marks and core components on one page. */
export default function BrandPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-14 px-6 py-12">
      <Paper className="rounded-2xl bg-ink p-10 text-paper">
        <LightciWordmark className="h-6 text-paper" />
        <h1 className="mt-6 font-display text-5xl font-medium leading-tight">Activate design language</h1>
        <p className="mt-3 max-w-xl text-paper/70">Ink on paper. A warm amber glow for mastery and progress. Playfair for what matters, Geist for everything else. Grain, never gloss.</p>
      </Paper>

      <section>
        <p className="eyebrow mb-3">Lockups</p>
        <div className="flex flex-wrap items-center gap-10 rounded-xl border bg-card p-8">
          <ActivateLockup />
          <ActivateLockup compact />
          <div className="rounded-lg bg-ink p-4 text-paper"><ActivateLockup /></div>
        </div>
      </section>

      <section>
        <p className="eyebrow mb-3">Colour</p>
        <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
          {swatches.map(([name, cls]) => (
            <div key={name} className={`rounded-lg p-4 text-sm font-medium ${cls}`}>{name}</div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {RUNGS.map((r) => <RungBadge key={r.rung} rung={r.rung} />)}
        </div>
      </section>

      <section>
        <p className="eyebrow mb-3">Type</p>
        <div className="space-y-3 rounded-xl border bg-card p-8">
          <h1 className="font-display text-5xl font-medium">Display 48 — Every rung is earned</h1>
          <h2 className="font-display text-3xl font-medium">Heading 30 — Context engineering for one person</h2>
          <p className="text-base">Body 16 — Predict before Claude runs, critique before you accept, write the prompt cold before Coach shows a worked example.</p>
          <p className="text-sm text-muted-foreground">Muted 14 — Source: Analytics API · Baseline: interview estimate, week 1</p>
          <p className="eyebrow">Eyebrow — Section label</p>
          <code className="block rounded bg-muted p-3 font-mono text-sm">--- name: advisor-meeting-prep ---</code>
        </div>
      </section>

      <section>
        <p className="eyebrow mb-3">Progress</p>
        <div className="flex flex-wrap items-center gap-8 rounded-xl border bg-card p-8">
          {[0, 1, 2, 3, 4, 5].map((r) => <RungRing key={r} rung={r} progress={(r + 1) / 6} size={88} />)}
        </div>
      </section>

      <section>
        <p className="eyebrow mb-3">Controls</p>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-8">
          <Button>Start exercise</Button>
          <Button variant="outline">Do this in Claude</Button>
          <Button variant="secondary">Reveal a hint</Button>
          <Button variant="ghost">Skip</Button>
          <Badge>Published</Badge>
          <Badge variant="outline">In review</Badge>
          <Badge className="bg-pass-soft text-pass border-0">Pass</Badge>
          <Badge className="bg-revise-soft text-revise-foreground border-0">Revise</Badge>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {["Next up", "Revisits due", "Hours back"].map((t) => (
          <Card key={t}>
            <CardHeader><CardTitle className="font-display text-lg">{t}</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">Card surface on paper with a hairline border and the display face for titles.</CardContent>
          </Card>
        ))}
      </section>
    </main>
  )
}
