"use client"

import {
  ArrowUp,
  Bot,
  Building2,
  FolderKanban,
  KeyRound,
  ListChecks,
  MessageSquarePlus,
  MessagesSquare,
  PanelLeft,
  PanelRight,
  Square,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react"
import { toast } from "sonner"

import { TangentMark } from "@/components/brand/tangent-logo"
import { DemoBadge } from "@/components/data/demo-badge"
import { useCan, useWorkspace } from "@/components/workspace/workspace-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { ApprovalList } from "@/features/approvals/approval-list"
import { AgentAvatar } from "@/features/command-centre/agent-avatar"
import { runModelFromRecord, type RunViewModel } from "@/features/command-centre/run-model"
import { RunView } from "@/features/command-centre/run-view"
import { useCommandRun } from "@/features/command-centre/use-command-run"
import { ACTIVE_AGENT_IDS, AGENT_IDS, AGENTS } from "@/lib/ai/agents/definitions"
import type { ApprovalView } from "@/lib/domain/approvals"
import type { Conversation, ConversationSummary, RunRecord } from "@/lib/domain/conversations"
import { workspaceHref } from "@/lib/navigation"
import { cn } from "@/lib/utils"

const SUGGESTIONS = [
  "Create a 30-day marketing strategy for my business.",
  "Analyse our social media performance.",
  "Create 10 Instagram posts for this month.",
  "Create a festive campaign across all connected channels.",
  "Research our competitors and suggest opportunities.",
  "Prepare a Google Ads campaign with a ₹500 daily budget.",
  "Analyse why our current campaign is not converting.",
]

type DisplayMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; model: RunViewModel }

export interface BusinessSummary {
  name: string
  industry: string
  location: string
}

export interface CommandCentreProps {
  conversations: ConversationSummary[]
  active: Conversation | null
  initialPrompt: string | null
  approvals: ApprovalView[]
  business: BusinessSummary | null
  brandName: string | null
}

function emptyRun(runId: string): RunRecord {
  return {
    runId,
    status: "completed",
    intent: null,
    taskType: null,
    steps: [],
    contextSources: [],
    outputs: [],
    validation: [],
    actions: [],
    limitations: [],
    error: null,
    durationMs: null,
  }
}

function toDisplay(conversation: Conversation | null): DisplayMessage[] {
  if (!conversation) return []
  return conversation.messages.map((m): DisplayMessage =>
    m.role === "user"
      ? { id: m.id, role: "user", text: m.text }
      : { id: m.id, role: "assistant", model: runModelFromRecord(m.run ?? emptyRun(m.id), m.text) }
  )
}

function PanelSection({ icon: Icon, title, children, action }: { icon: typeof Bot; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <Icon className="size-3.5" /> {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function CommandCentre(props: CommandCentreProps) {
  const { workspace, aiConfigured, mode } = useWorkspace()
  const canRun = useCan("ai.run")
  const router = useRouter()
  const { live, start, stop, running } = useCommandRun()

  const [conversations, setConversations] = useState(props.conversations)
  const [conversationId, setConversationId] = useState<string | null>(props.active?.id ?? null)
  const [messages, setMessages] = useState<DisplayMessage[]>(() => toDisplay(props.active))
  const [draft, setDraft] = useState(props.initialPrompt ?? "")
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const activeTitle = conversations.find((c) => c.id === conversationId)?.title ?? "New conversation"
  const isSample = props.active?.isSample ?? false

  const liveOutputCount = Object.keys(live?.outputs ?? {}).length
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages.length, live?.text, live?.steps.length, liveOutputCount])

  const latestRun: RunViewModel | null = useMemo(() => {
    if (live) return live
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m?.role === "assistant") return m.model
    }
    return null
  }, [live, messages])

  const conversationTasks = useMemo(
    () =>
      messages.flatMap((m) =>
        m.role === "assistant" ? m.model.steps.map((s) => ({ ...s, state: m.model.stepState[s.id] ?? "pending", key: `${m.id}-${s.id}` })) : []
      ),
    [messages]
  )

  const disabledReason = !aiConfigured
    ? "AI is not configured"
    : !canRun
      ? "Your role cannot run AI agents"
      : null

  const send = async (text: string) => {
    const message = text.trim()
    if (!message || running || disabledReason) return
    setError(null)
    setDraft("")
    const userMessage: DisplayMessage = { id: crypto.randomUUID(), role: "user", text: message }
    setMessages((list) => [...list, userMessage])

    const result = await start({
      workspace: workspace.slug,
      conversationId,
      message,
      onConversation: (id) => {
        if (id === conversationId) return
        setConversationId(id)
        window.history.replaceState(null, "", `?c=${id}`)
        setConversations((list) =>
          list.some((c) => c.id === id)
            ? list
            : [{ id, title: message.length > 60 ? `${message.slice(0, 57)}…` : message, updatedAt: new Date().toISOString(), isSample: false }, ...list]
        )
      },
    })

    if (!result.ok) {
      setMessages((list) => list.filter((m) => m.id !== userMessage.id))
      setDraft(message)
      setError(result.message)
      toast.error(result.message)
      return
    }
    setMessages((list) => [...list, { id: crypto.randomUUID(), role: "assistant", model: result.model }])
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void send(draft)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void send(draft)
    }
  }

  const newConversation = () => {
    if (running) return
    router.push(workspaceHref(workspace.slug, "command-centre"))
    setConversationId(null)
    setMessages([])
    setError(null)
    inputRef.current?.focus()
  }

  const historyPanel = (
    <div className="space-y-6">
      <Button onClick={newConversation} variant="outline" size="sm" className="w-full justify-start" disabled={running}>
        <MessageSquarePlus /> New conversation
      </Button>
      <PanelSection icon={MessagesSquare} title="Conversations">
        {conversations.length === 0 ? (
          <p className="text-xs text-muted-foreground">No conversations yet.</p>
        ) : (
          <ul className="-mx-2 space-y-0.5">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`${workspaceHref(workspace.slug, "command-centre")}?c=${c.id}`}
                  aria-current={c.id === conversationId ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted",
                    c.id === conversationId && "bg-muted font-medium"
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  {c.isSample ? <span className="shrink-0 text-[0.65rem] text-warning">Sample</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PanelSection>
      <PanelSection icon={ListChecks} title="Tasks in this conversation">
        {conversationTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">Agent tasks appear here as Tangent works.</p>
        ) : (
          <ul className="space-y-1.5">
            {conversationTasks.map((t) => (
              <li key={t.key} className="flex items-start gap-2 text-xs">
                <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", t.state === "done" ? "bg-success" : t.state === "failed" ? "bg-destructive" : "bg-muted-foreground")} />
                <span className="line-clamp-2">{t.title}</span>
              </li>
            ))}
          </ul>
        )}
      </PanelSection>
      <PanelSection icon={FolderKanban} title="Saved projects">
        <p className="text-xs text-muted-foreground">
          Save outputs as projects once Creative Studio and Campaigns ship (Phases 3 and 5).
        </p>
      </PanelSection>
    </div>
  )

  const contextPanel = (
    <div className="space-y-6">
      <PanelSection
        icon={Building2}
        title="Business context"
        action={
          <Link href={workspaceHref(workspace.slug, "strategy")} className="text-xs text-brand hover:underline">
            Edit
          </Link>
        }
      >
        {props.business ? (
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium">{props.business.name}</p>
            <p className="text-xs text-muted-foreground">
              {props.business.industry} · {props.business.location}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Brand: <span className="text-foreground">{props.brandName ?? "No brand profile"}</span>
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            No business profile yet.{" "}
            <Link href={workspaceHref(workspace.slug, "onboarding")} className="text-brand hover:underline">
              Complete onboarding
            </Link>{" "}
            so every agent understands your business.
          </div>
        )}
      </PanelSection>

      <PanelSection
        icon={Bot}
        title="Agents"
        action={
          <Link href={workspaceHref(workspace.slug, "agents")} className="text-xs text-brand hover:underline">
            All {AGENT_IDS.length}
          </Link>
        }
      >
        <ul className="space-y-2">
          {ACTIVE_AGENT_IDS.map((id) => {
            const working = live?.steps.some((s) => s.agentId === id && live.stepState[s.id] === "running")
            return (
              <li key={id} className="flex items-center gap-2.5">
                <AgentAvatar agentId={id} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{AGENTS[id].name}</p>
                </div>
                <Badge variant={working ? "brand" : "muted"}>{working ? "Working" : "Ready"}</Badge>
              </li>
            )
          })}
        </ul>
      </PanelSection>

      <PanelSection icon={ListChecks} title="Task status">
        {latestRun && latestRun.steps.length ? (
          <ul className="space-y-1.5">
            {latestRun.steps.map((s) => {
              const state = latestRun.stepState[s.id] ?? "pending"
              return (
                <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">{s.title}</span>
                  <span className={cn("shrink-0 capitalize", state === "done" ? "text-success" : state === "failed" ? "text-destructive" : state === "running" ? "text-brand" : "text-muted-foreground")}>
                    {state === "done" ? "Done" : state}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No tasks running.</p>
        )}
      </PanelSection>

      <PanelSection icon={ListChecks} title="Pending approvals">
        <div className="-mx-1">
          <ApprovalList initial={props.approvals} compact />
        </div>
      </PanelSection>
    </div>
  )

  return (
    <div className="grid h-[calc(100svh-3rem)] min-h-0 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_19rem]">
      <aside className="hidden min-h-0 border-r lg:block" aria-label="Conversation history">
        <ScrollArea className="h-full">
          <div className="p-3">{historyPanel}</div>
        </ScrollArea>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col" aria-label="Conversation">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Conversation history">
                <PanelLeft />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 overflow-y-auto p-4">
              <SheetHeader className="p-0">
                <SheetTitle>History</SheetTitle>
                <SheetDescription className="sr-only">Conversations and tasks</SheetDescription>
              </SheetHeader>
              {historyPanel}
            </SheetContent>
          </Sheet>
          <h1 className="min-w-0 truncate font-sans text-sm font-medium">{activeTitle}</h1>
          {isSample ? <DemoBadge label="Sample output" detail="This conversation is a sample and was not generated by an AI model." /> : null}
          <div className="ml-auto xl:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Business context and approvals">
                  <PanelRight />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80 overflow-y-auto p-4">
                <SheetHeader className="p-0">
                  <SheetTitle>Workspace context</SheetTitle>
                  <SheetDescription className="sr-only">Business context, agents, tasks and approvals</SheetDescription>
                </SheetHeader>
                {contextPanel}
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
            {messages.length === 0 && !live ? (
              <div className="pt-6 md:pt-12">
                <TangentMark className="size-8 text-foreground" />
                <h2 className="mt-4 text-2xl font-semibold">What should your marketing team work on?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tangent plans the work, assigns specialist agents, checks the output against your brand and asks before
                  anything goes live.
                </p>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setDraft(s)
                        inputRef.current?.focus()
                      }}
                      className="rounded-lg border bg-card px-3 py-2.5 text-left text-sm transition-colors hover:border-brand/40 hover:bg-brand-subtle/40"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-lg bg-muted px-3.5 py-2.5 text-sm whitespace-pre-wrap">{m.text}</p>
                </div>
              ) : (
                <div key={m.id} className="flex gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border">
                    <TangentMark className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <RunView model={m.model} />
                  </div>
                </div>
              )
            )}

            {live ? (
              <div className="flex gap-3" aria-live="polite">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border">
                  <TangentMark className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <RunView model={live} />
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        <div className="shrink-0 border-t bg-background px-4 py-3">
          <div className="mx-auto w-full max-w-3xl space-y-2">
            {!aiConfigured ? (
              <p className="flex items-start gap-2 rounded-md bg-warning-subtle px-3 py-2 text-xs text-foreground/80" role="status">
                <KeyRound className="mt-0.5 size-3.5 shrink-0 text-warning" />
                <span>
                  AI is not configured. Add <code className="font-mono">OPENAI_API_KEY</code> or{" "}
                  <code className="font-mono">ANTHROPIC_API_KEY</code> to{" "}
                  <code className="font-mono">.env.local</code> and restart to run agents.
                  {mode === "demo" ? " Sample conversations are available to browse." : ""} Tangent never fakes AI responses.
                </span>
              </p>
            ) : null}
            {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
            <form onSubmit={onSubmit} className="relative rounded-lg border bg-card focus-within:ring-2 focus-within:ring-ring/40">
              <label htmlFor="command-input" className="sr-only">
                Instruction for Tangent
              </label>
              <Textarea
                id="command-input"
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={disabledReason ? `${disabledReason}.` : "Ask your marketing team… (Enter to send, Shift+Enter for a new line)"}
                disabled={Boolean(disabledReason)}
                rows={2}
                maxLength={4000}
                className="max-h-48 min-h-14 resize-none border-0 bg-transparent pr-14 shadow-none focus-visible:ring-0 dark:bg-transparent"
              />
              <div className="absolute right-2 bottom-2">
                {running ? (
                  <Button type="button" size="icon-sm" variant="outline" onClick={stop} aria-label="Stop run">
                    <Square className="fill-current" />
                  </Button>
                ) : (
                  <Button type="submit" size="icon-sm" variant="brand" disabled={!draft.trim() || Boolean(disabledReason)} aria-label="Send">
                    <ArrowUp />
                  </Button>
                )}
              </div>
            </form>
            <p className="text-center text-[0.7rem] text-muted-foreground">
              Agents create drafts and plans only. Publishing, ad launches and spend always need your approval.
            </p>
          </div>
        </div>
      </section>

      <aside className="hidden min-h-0 border-l xl:block" aria-label="Workspace context">
        <ScrollArea className="h-full">
          <div className="p-4">{contextPanel}</div>
        </ScrollArea>
      </aside>
    </div>
  )
}
