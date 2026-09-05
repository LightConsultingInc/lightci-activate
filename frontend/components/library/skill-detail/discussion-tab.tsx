"use client"

import { useState } from "react"
import { toast } from "sonner"
import { MessageSquare, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { useCommentSkill } from "@/hooks/library/queries"
import { fmt } from "@/lib/format"
import { cn } from "@/lib/utils"
import { PersonChip } from "../person-chip"
import { describeError } from "../skill-actions"
import type { SkillDetail } from "@/hooks/library/types"

export function DiscussionTab({ skill }: { skill: SkillDetail }) {
  const comment = useCommentSkill(skill.slug)
  const [body, setBody] = useState("")
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (body.trim().length < 2) return
    comment.mutate({ id: skill.id, body: body.trim() }, { onSuccess: () => { setBody(""); toast.success("Posted. The Grader reads this thread on the next revision.") }, onError: (err) => toast.error("Couldn't post", { description: describeError(err) }) })
  }
  const comments = [...skill.comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return (
    <div className="mx-auto max-w-3xl">
      <ul className="space-y-4" data-testid="comments-thread">
        {comments.length === 0 && (
          <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground"><MessageSquare className="mx-auto mb-2 size-5" />No comments yet. Say what happened when you ran it on a real case; the owner and the Grader both read this.</li>
        )}
        {comments.map((c) => (
          <li key={c.id} className={cn("rounded-xl border bg-card p-4", c.kind === "grader" && "border-claude/30 bg-claude-soft/40")} data-testid="comment" data-kind={c.kind}>
            <div className="flex items-center justify-between gap-2 text-xs">
              {c.kind === "grader" ? <span className="rounded-full bg-claude-soft px-2 py-0.5 font-medium text-claude">Grader summary</span> : <PersonChip person={c.person} size="xs" />}
              <span className="text-muted-foreground">{fmt.ago(c.createdAt)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{c.body}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="mt-6 rounded-xl border bg-card p-3">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="What worked, what you had to fix by hand, which client situation it missed…" className="min-h-20 border-0 shadow-none focus-visible:ring-0" data-testid="comment-input" />
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Feedback here feeds the Grader on the next revision.</p>
          <Button type="submit" size="sm" disabled={body.trim().length < 2 || comment.isPending} data-testid="comment-submit">{comment.isPending ? <Spinner className="size-3.5" /> : <Send data-icon="inline-start" />} Post</Button>
        </div>
      </form>
    </div>
  )
}
