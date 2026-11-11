import { AlertTriangle, KeyRound, PlugZap, type LucideIcon } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center", className)}>
      <span className="flex size-10 items-center justify-center rounded-lg bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </span>
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

/** Shown when a feature needs server credentials that are not configured. */
export function NotConfigured({
  title,
  description,
  envVars,
  className,
}: {
  title: string
  description: ReactNode
  envVars: string[]
  className?: string
}) {
  return (
    <div className={cn("rounded-lg border bg-card p-5", className)} role="status">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-warning-subtle">
          <KeyRound className="size-4 text-warning" />
        </span>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
          <div className="flex flex-wrap gap-1.5">
            {envVars.map((name) => (
              <code key={name} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {name}
              </code>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Add these to <code className="font-mono">.env.local</code> (see <code className="font-mono">.env.example</code>) and restart the server.
          </p>
        </div>
      </div>
    </div>
  )
}

/** Shown when an action needs a connected external account. Never simulates success. */
export function ConnectionRequired({
  provider,
  description,
  href,
  className,
}: {
  provider: string
  description: ReactNode
  href: string
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center", className)} role="status">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-info-subtle">
        <PlugZap className="size-4 text-info" />
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium">{provider} connection required</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link href={href}>Go to Integrations</Link>
      </Button>
    </div>
  )
}

export function ErrorState({ title, description, action }: { title: string; description: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-danger-subtle p-4" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-destructive">{title}</p>
          <p className="text-sm text-foreground/80">{description}</p>
          {action ? <div className="pt-2">{action}</div> : null}
        </div>
      </div>
    </div>
  )
}
