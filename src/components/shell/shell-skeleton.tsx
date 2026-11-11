import { TangentLogo } from "@/components/brand/tangent-logo"
import { Skeleton } from "@/components/ui/skeleton"

/** Static fallback shown while the workspace context resolves. */
export function ShellSkeleton() {
  return (
    <div className="flex min-h-svh" aria-busy="true" aria-label="Loading workspace">
      <aside className="hidden w-64 shrink-0 flex-col gap-4 border-r bg-sidebar p-3 md:flex">
        <TangentLogo className="h-8 px-2" />
        <Skeleton className="h-12 w-full" />
        <div className="mt-2 space-y-2">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <div className="h-12 border-b" />
        <div className="space-y-4 p-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    </div>
  )
}
