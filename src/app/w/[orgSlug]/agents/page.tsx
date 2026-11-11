import type { Metadata } from "next"

import { PageContainer, PageHeader } from "@/components/page/page-header"
import { Badge } from "@/components/ui/badge"
import { AGENT_IDS, AGENTS, type AgentDefinition } from "@/lib/ai/agents/definitions"

export const metadata: Metadata = { title: "AI Agents" }

const SCOPE_LABELS: Record<AgentDefinition["maxScope"], string> = {
  read: "Read only",
  create: "Read + create drafts",
  execute: "Can request external actions (approval required)",
}

function AgentCard({ agent }: { agent: AgentDefinition }) {
  const active = agent.status === "active"
  return (
    <div className="flex flex-col rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{agent.name}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{agent.summary}</p>
        </div>
        <Badge variant={active ? "success" : "muted"} className="shrink-0">
          {active ? "Active" : `Phase ${agent.phase}`}
        </Badge>
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        {agent.responsibilities.map((r) => (
          <li key={r}>· {r}</li>
        ))}
      </ul>
      <dl className="mt-4 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5 border-t pt-3 text-xs">
        <dt className="text-muted-foreground">Permissions</dt>
        <dd>{SCOPE_LABELS[agent.maxScope]}</dd>
        <dt className="text-muted-foreground">Tools</dt>
        <dd className="flex flex-wrap gap-1">
          {agent.tools.map((t) => (
            <code key={t} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.68rem]">
              {t}
            </code>
          ))}
        </dd>
        <dt className="text-muted-foreground">Limits</dt>
        <dd>
          {agent.limits.maxCallsPerRun} calls per run · {agent.limits.maxOutputTokens.toLocaleString("en-IN")} output tokens
        </dd>
      </dl>
    </div>
  )
}

export default function AgentsPage() {
  const agents = AGENT_IDS.map((id) => AGENTS[id])
  const active = agents.filter((a) => a.status === "active")
  const planned = agents.filter((a) => a.status === "planned")

  return (
    <PageContainer>
      <PageHeader
        title="AI Agents"
        description="One orchestrator, specialist task handlers. Every agent shares your business and brand context, works within defined tools and limits, and logs each run."
      />
      <section className="space-y-3">
        <h2 className="font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase">Active ({active.length})</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {active.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </section>
      {planned.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase">Joining the team ({planned.length})</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {planned.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </section>
      ) : null}
    </PageContainer>
  )
}
