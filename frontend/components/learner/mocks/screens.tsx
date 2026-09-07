"use client"

import { BookOpen, Camera, Check, ChevronDown, Cloud, Copy, Database, FileText, Pencil, Phone, RotateCcw, Settings, ThumbsDown, ThumbsUp, Upload } from "lucide-react"
import { Composer, Menu, MenuItem, Message, Sidebar, Spot, Toggle, Window } from "./frame"

const Shell = ({ children, active, spots, projectName }: { children: React.ReactNode; active?: Parameters<typeof Sidebar>[0]["active"]; spots?: Parameters<typeof Sidebar>[0]["spots"]; projectName?: string }) => (
  <Window>
    <div className="flex min-h-[300px]">
      <Sidebar active={active} spots={spots} projectName={projectName} />
      <main className="relative min-w-0 flex-1 p-4 sm:p-6">{children}</main>
    </div>
  </Window>
)

/** 1 · A fresh chat: the rail, the box, the plus, the tools, send. */
export function NewChat() {
  return (
    <Shell spots={{ chats: 1, projects: 2, code: 3, cowork: 4 }}>
      <div className="mx-auto flex h-full max-w-md flex-col justify-center gap-5 py-6">
        <p className="text-center font-display text-xl">Good afternoon. What are we working on?</p>
        <Composer spots={{ plus: 5, tools: 6, send: 7 }} />
      </div>
    </Shell>
  )
}

/** 2 · The plus menu open: upload, Drive, screenshot. Paste works too. */
export function AttachMenu() {
  return (
    <Shell>
      <div className="mx-auto flex h-full max-w-md flex-col justify-end gap-3 py-2">
        <Menu className="ml-0" title="Add to this chat">
          <Spot n={2} pos="r"><MenuItem icon={<Upload className="size-3.5" />}>Upload a file</MenuItem></Spot>
          <Spot n={3} pos="r"><MenuItem icon={<Cloud className="size-3.5" />}>Add from Google Drive</MenuItem></Spot>
          <MenuItem icon={<Camera className="size-3.5" />}>Take a screenshot</MenuItem>
          <div className="mt-1 border-t pt-1"><MenuItem icon={<Database className="size-3.5" />} trailing={<ChevronDown className="size-3 -rotate-90 text-muted-foreground" />}>Connectors</MenuItem></div>
        </Menu>
        <Composer spots={{ plus: 1, box: 4 }} text="Here are my notes from the Harbor Trust call. Turn them into a follow-up email…" />
      </div>
    </Shell>
  )
}

/** 3 · The plus menu, Connectors open: the ones your firm has switched on, each on or off for this chat. */
export function ToolsMenu() {
  const tools = [
    { icon: <Database className="size-3.5" />, name: "Salesforce" },
    { icon: <Cloud className="size-3.5" />, name: "Google Drive" },
    { icon: <Phone className="size-3.5" />, name: "Gong" },
    { icon: <BookOpen className="size-3.5" />, name: "Confluence" },
  ]
  return (
    <Shell>
      <div className="mx-auto flex h-full max-w-md flex-col justify-end gap-3 py-2">
        <Menu title="Connectors">
          <Spot n={2} pos="r" className="w-fit"><p className="px-2 pb-1 pr-3 text-[10px] uppercase tracking-wider text-muted-foreground">On for this chat</p></Spot>
          {tools.map((t) => <MenuItem key={t.name} icon={t.icon} trailing={<Toggle />}>{t.name}</MenuItem>)}
          <div className="mt-1 border-t pt-1"><Spot n={3} pos="r" className="w-fit pr-3"><MenuItem>Manage connectors…</MenuItem></Spot></div>
        </Menu>
        <Composer spots={{ plus: 1, box: 4 }} text="Using Salesforce, show me the open opportunities I own that close this month, oldest first." />
      </div>
    </Shell>
  )
}

/** 4 · A conversation: your request, Claude's draft, the actions under it, and the follow-up box. */
export function Conversation() {
  return (
    <Shell active="chats">
      <div className="mx-auto flex h-full max-w-lg flex-col gap-4">
        <Spot n={1} pos="tl">
          <Message from="you">
            Write a two-paragraph update for a client who hasn&apos;t heard from us in a quarter. Use the attached review notes and last quarter&apos;s letter. Plain email, no bullet points, under 150 words. No performance promises.
          </Message>
        </Spot>
        <Spot n={2} pos="tl">
          <Message from="claude">
            <p>Hi Dana, it has been a quiet quarter on our side and a steady one on yours. Your portfolio finished the period close to where it started, with the bond allocation doing the work we expected of it…</p>
            <p className="text-muted-foreground">Second paragraph: the two items from the review notes, and an offer to talk.</p>
            <Spot n={3} pos="r" className="w-fit pr-2">
              <div className="flex items-center gap-2 pt-1 text-muted-foreground">
                <Copy className="size-3.5" /><ThumbsUp className="size-3.5" /><ThumbsDown className="size-3.5" /><RotateCcw className="size-3.5" />
              </div>
            </Spot>
          </Message>
        </Spot>
        <Composer className="mt-auto" spots={{ box: 4 }} text="Good. Shorter, and take out the line about the bond allocation, they asked us not to talk allocation in writing." />
      </div>
    </Shell>
  )
}

/** 5 · A Project page: instructions, files, connected folder, and the box that starts a chat inside it. */
export function ProjectPage() {
  return (
    <Shell active="projects" projectName="Quarterly client letters">
      <div className="grid gap-4 md:grid-cols-[1fr_200px]">
        <div className="space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Project</p>
            <h3 className="font-display text-lg">Quarterly client letters</h3>
          </div>
          <Composer spots={{ box: 4 }} placeholder="Start a chat in this project…" />
          <div className="space-y-1.5 text-[12px]">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Chats in this project</p>
            {["Letter for the Okafor household", "Letter for Harbor Trust, Q3", "Draft: fee change note"].map((c) => (
              <div key={c} className="rounded-lg border px-3 py-2 text-muted-foreground">{c}</div>
            ))}
          </div>
        </div>
        <aside className="space-y-3 text-[12px]">
          <Spot n={1} pos="tl">
            <div className="rounded-xl border p-3">
              <p className="font-medium">Instructions</p>
              <p className="mt-1 text-muted-foreground">Write like Priya: warm, plain, no jargon. Two paragraphs. Never promise a return…</p>
              <p className="mt-2 inline-flex items-center gap-1 text-claude"><Pencil className="size-3" /> Edit</p>
            </div>
          </Spot>
          <Spot n={2} pos="tl">
            <div className="rounded-xl border p-3">
              <p className="font-medium">Files</p>
              <ul className="mt-1.5 space-y-1 text-muted-foreground">
                {["Letter template", "How we write, one page", "Two good letters"].map((f) => (
                  <li key={f} className="flex items-center gap-1.5"><FileText className="size-3" /> {f}</li>
                ))}
              </ul>
              <p className="mt-2 text-claude">+ Add files</p>
            </div>
          </Spot>
          <Spot n={3} pos="tl">
            <div className="rounded-xl border p-3">
              <p className="font-medium">Connected</p>
              <p className="mt-1 flex items-center gap-1.5 text-muted-foreground"><Cloud className="size-3" /> Drive · Client letters folder</p>
            </div>
          </Spot>
        </aside>
      </div>
    </Shell>
  )
}

/** 6 · Editing the Project's instructions. */
export function ProjectInstructions() {
  return (
    <Shell active="projects" projectName="Quarterly client letters">
      <div className="mx-auto max-w-md rounded-2xl border bg-background p-4 shadow-lg">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Project instructions</p>
        <p className="mt-1 text-[12px] text-muted-foreground">How should Claude behave in this project?</p>
        <Spot n={1} pos="tl">
          <div className="mt-3 space-y-1.5 rounded-xl border bg-card p-3 text-[12.5px] leading-relaxed">
            <p>You draft quarterly letters for my clients. I sign them, so write in my voice: warm, plain, two paragraphs.</p>
            <Spot n={2} pos="r" className="w-fit pr-4"><p>Lead with what changed for them, not with the markets.</p></Spot>
            <p>Never promise a return or predict one. If the notes mention a life event, acknowledge it first.</p>
            <p>Use the template file for layout and the two good letters for tone.</p>
            <p className="text-muted-foreground">If something in the notes is unclear, ask me before drafting.</p>
          </div>
        </Spot>
        <div className="mt-3 flex justify-end gap-2 text-[12px]">
          <span className="rounded-lg border px-3 py-1.5 text-muted-foreground">Cancel</span>
          <Spot n={3}><span className="inline-block rounded-lg bg-claude px-3 py-1.5 text-paper">Save</span></Spot>
        </div>
      </div>
    </Shell>
  )
}

/** 7 · A skill picked up from a plain request: the step Claude shows, what it read, the result. */
export function SkillInUse() {
  return (
    <Shell active="chats">
      <div className="mx-auto flex h-full max-w-lg flex-col gap-4">
        <Spot n={1} pos="tl"><Message from="you">Prep me for tomorrow&apos;s call with Harbor Trust.</Message></Spot>
        <Message from="claude">
          <Spot n={2} pos="tl" className="w-fit">
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-[12px]">
              <p className="flex items-center gap-1.5 font-medium"><Check className="size-3.5 text-pass" /> Using skill: Meeting prep <ChevronDown className="size-3 text-muted-foreground" /></p>
              <Spot n={3} pos="r" className="w-fit">
                <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
                  <li className="flex items-center gap-1.5"><Database className="size-3" /> Read Salesforce · Harbor Trust account</li>
                  <li className="flex items-center gap-1.5"><Phone className="size-3" /> Read Gong · last two calls</li>
                  <li className="flex items-center gap-1.5"><FileText className="size-3" /> Read Drive · Q3 review deck</li>
                </ul>
              </Spot>
            </div>
          </Spot>
          <Spot n={4} pos="tl">
            <div className="pl-3 pt-1">
              <p className="font-medium">Harbor Trust · call prep</p>
              <p className="text-muted-foreground">Since your last call: the renewal moved to November, and Maya raised fees twice on the September call. Three things to bring up, one thing to avoid…</p>
            </div>
          </Spot>
        </Message>
        <Composer className="mt-auto" />
      </div>
    </Shell>
  )
}

/** 8 · Settings › Connectors: connect your own account, once, to a connector your firm has turned on. */
export function ConnectorsSettings() {
  const rows = [
    { icon: <Database className="size-4" />, name: "Salesforce", sub: "Accounts, opportunities, notes", state: "connected" as const },
    { icon: <Cloud className="size-4" />, name: "Google Drive", sub: "Documents and spreadsheets", state: "connected" as const },
    { icon: <Phone className="size-4" />, name: "Gong", sub: "Call recordings and transcripts", state: "connect" as const },
    { icon: <BookOpen className="size-4" />, name: "Confluence", sub: "Internal pages", state: "connect" as const },
  ]
  return (
    <Window url="claude.ai/settings/connectors">
      <div className="flex min-h-[300px]">
        <aside className="hidden w-[168px] shrink-0 flex-col gap-0.5 border-r bg-muted/25 p-2 sm:flex">
          <Spot n={1} pos="r" className="w-fit"><div className="mb-2 flex items-center gap-1.5 px-2 pt-1 text-[13px] font-semibold"><Settings className="size-3.5" /> Settings</div></Spot>
          {["Profile", "Appearance", "Capabilities"].map((x) => <div key={x} className="rounded-lg px-2 py-1.5 text-[12px] text-muted-foreground">{x}</div>)}
          <Spot n={2} pos="r"><div className="rounded-lg bg-foreground/[0.06] px-2 py-1.5 text-[12px] font-medium">Connectors</div></Spot>
          {["Privacy", "Billing"].map((x) => <div key={x} className="rounded-lg px-2 py-1.5 text-[12px] text-muted-foreground">{x}</div>)}
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <h3 className="font-display text-lg">Connectors</h3>
          <p className="mt-1 text-[12px] text-muted-foreground">Turned on for Northgate Advisory by your admin. Connect your own account to use one.</p>
          <ul className="mt-4 divide-y rounded-xl border text-[12.5px]">
            {rows.map((r, i) => (
              <li key={r.name} className="flex items-center gap-3 px-3 py-2.5">
                <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">{r.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{r.name}</span>
                  <span className="block text-[11px] text-muted-foreground">{r.sub}</span>
                </span>
                {r.state === "connected" ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-pass"><Check className="size-3" /> Connected</span>
                ) : i === 2 ? (
                  <Spot n={3}><span className="inline-block rounded-lg bg-claude px-3 py-1.5 text-[12px] text-paper">Connect</span></Spot>
                ) : (
                  <span className="inline-block rounded-lg border px-3 py-1.5 text-[12px]">Connect</span>
                )}
              </li>
            ))}
          </ul>
          <Spot n={4} pos="tl" className="mt-4 w-fit">
            <div className="rounded-xl border bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">Signing in to Gong… <span className="text-foreground">you approve, once, with your own Gong login.</span></div>
          </Spot>
        </main>
      </div>
    </Window>
  )
}
