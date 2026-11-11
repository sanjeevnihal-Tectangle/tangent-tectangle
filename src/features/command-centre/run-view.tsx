"use client"

import { motion } from "framer-motion"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleDashed,
  Database,
  Loader2,
  PlugZap,
  ShieldCheck,
  X,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { useWorkspace } from "@/components/workspace/workspace-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { AgentAvatar } from "@/features/command-centre/agent-avatar"
import { AgentOutputView } from "@/features/command-centre/output-cards"
import type { RunViewModel, StageState, StepState } from "@/features/command-centre/run-model"
import { SimpleMarkdown } from "@/features/command-centre/simple-markdown"
import { AGENTS } from "@/lib/ai/agents/definitions"
import { RUN_STAGE_LABELS, RUN_STAGES } from "@/lib/ai/events"
import { EXTERNAL_ACTION_LABELS } from "@/lib/approvals/engine"
import { workspaceHref } from "@/lib/navigation"
import { cn } from "@/lib/utils"

function StageIcon({ state }: { state: StageState | StepState }) {
  switch (state) {
    case "done":
      return <Check className="size-3.5 text-success" />
    case "active":
    case "running":
      return <Loader2 className="size-3.5 animate-spin text-brand" />
    case "failed":
      return <X className="size-3.5 text-destructive" />
    case "pending":
      return <CircleDashed className="size-3.5 text-muted-foreground/60" />
    default: {
      const unreachable: never = state
      return unreachable
    }
  }
}

function ExecutionProgress({ model }: { model: RunViewModel }) {
  const running = model.status === "running"
  const [open, setOpen] = useState(false)
  const expanded = running || open
  const agentCount = new Set(model.steps.map((s) => s.agentId)).size

  return (
    <Collapsible open={expanded} onOpenChange={setOpen} className="rounded-lg border bg-muted/20">
      <CollapsibleTrigger asChild disabled={running}>
        <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs">
          {running ? (
            <Loader2 className="size-3.5 animate-spin text-brand" />
          ) : model.status === "failed" ? (
            <AlertTriangle className="size-3.5 text-destructive" />
          ) : (
            <ShieldCheck className="size-3.5 text-success" />
          )}
          <span className="font-medium">
            {running
              ? RUN_STAGE_LABELS[RUN_STAGES.find((s) => model.stages[s] === "active") ?? "understanding"]
              : model.status === "failed"
                ? "Run failed"
                : `Completed${model.durationMs ? ` in ${Math.round(model.durationMs / 1000)}s` : ""}`}
          </span>
          {!running && model.steps.length ? (
            <span className="text-muted-foreground">
              · {model.steps.length} task{model.steps.length > 1 ? "s" : ""} · {agentCount} agent{agentCount > 1 ? "s" : ""}
            </span>
          ) : null}
          {!running ? <ChevronDown className={cn("ml-auto size-3.5 transition-transform", expanded && "rotate-180")} /> : null}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-4 border-t px-3 py-3 md:grid-cols-2">
          <ol className="space-y-1.5" aria-label="Execution stages">
            {RUN_STAGES.map((stage) => (
              <li key={stage} className={cn("flex items-center gap-2 text-xs", model.stages[stage] === "pending" && "text-muted-foreground")}>
                <StageIcon state={model.stages[stage]} />
                {RUN_STAGE_LABELS[stage]}
              </li>
            ))}
          </ol>
          <div className="space-y-3">
            {model.contextSources.length ? (
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
                  <Database className="size-3" /> Context used
                </p>
                <ul className="space-y-0.5 text-xs">
                  {model.contextSources.map((s) => (
                    <li key={s.label}>
                      <span className="font-medium">{s.label}:</span> <span className="text-muted-foreground">{s.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {model.steps.length ? (
              <div>
                <p className="mb-1 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">Agent tasks</p>
                <ul className="space-y-1">
                  {model.steps.map((step) => (
                    <li key={step.id} className="flex items-center gap-2 text-xs">
                      <StageIcon state={model.stepState[step.id] ?? "pending"} />
                      <span className="font-medium">{AGENTS[step.agentId].shortName}</span>
                      <span className="truncate text-muted-foreground">{step.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function RunView({ model }: { model: RunViewModel }) {
  const { workspace } = useWorkspace()

  return (
    <div className="space-y-3">
      <ExecutionProgress model={model} />

      {model.intent ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Plan:</span> {model.intent}
        </p>
      ) : null}

      {model.steps.map((step) => {
        const output = model.outputs[step.id]
        const state = model.stepState[step.id] ?? "pending"
        if (!output && state !== "failed" && state !== "running") return null
        return (
          <motion.section
            key={step.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="rounded-lg border bg-card"
            aria-label={step.title}
          >
            <header className="flex items-center gap-2.5 border-b px-3 py-2">
              <AgentAvatar agentId={step.agentId} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{step.title}</p>
                <p className="text-xs text-muted-foreground">{AGENTS[step.agentId].name}</p>
              </div>
              <span className="ml-auto">
                <StageIcon state={state} />
              </span>
            </header>
            <div className="p-3">
              {output ? (
                <AgentOutputView output={output} />
              ) : state === "running" ? (
                <p className="text-sm text-muted-foreground">Working on it…</p>
              ) : (
                <p className="text-sm text-destructive">{model.stepErrors[step.id] ?? "This step failed."}</p>
              )}
            </div>
          </motion.section>
        )
      })}

      {model.validation.length ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Validation checks">
          {model.validation.map((check) => (
            <Badge
              key={check.label}
              variant={check.status === "pass" ? "success" : check.status === "warn" ? "warning" : "danger"}
              title={check.detail}
            >
              {check.status === "pass" ? <Check /> : <AlertTriangle />}
              {check.label}
            </Badge>
          ))}
        </div>
      ) : null}

      {model.validation.some((c) => c.status !== "pass") ? (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {model.validation
            .filter((c) => c.status !== "pass")
            .map((c) => (
              <li key={c.label}>
                {c.label}: {c.detail}
              </li>
            ))}
        </ul>
      ) : null}

      {model.actions.map((action, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border border-info/30 bg-info-subtle/50 p-3 sm:flex-row sm:items-center">
          <PlugZap className="size-4 shrink-0 text-info" />
          <div className="flex-1 text-sm">
            <p className="font-medium">
              {EXTERNAL_ACTION_LABELS[action.actionType]} on {action.platform} — not executed
            </p>
            <p className="text-xs text-muted-foreground">
              {action.description}. {action.platform} isn&apos;t connected. Once connected, this becomes an approval request and
              runs only after you approve it.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={workspaceHref(workspace.slug, "integrations")}>Connect {action.platform}</Link>
          </Button>
        </div>
      ))}

      {model.limitations.length ? (
        <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">Limitations</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {model.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {model.text ? <SimpleMarkdown text={model.text} /> : null}

      {model.error ? (
        <p className="flex items-start gap-2 rounded-md bg-danger-subtle p-2.5 text-sm text-destructive" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {model.error.message}
        </p>
      ) : null}
    </div>
  )
}
