import Link from "next/link"

import { TangentLogo } from "@/components/brand/tangent-logo"
import { Button } from "@/components/ui/button"
import { isSupabaseConfigured } from "@/lib/env/public"

export default function AuthLayout({ children }: LayoutProps<"/">) {
  const configured = isSupabaseConfigured()
  return (
    <div className="grid min-h-svh lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <TangentLogo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          {!configured ? (
            <div className="mb-6 rounded-lg border border-warning/40 bg-warning-subtle p-3 text-sm" role="status">
              <p className="font-medium">Authentication is not configured</p>
              <p className="mt-1 text-foreground/80">
                Add <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable accounts. Meanwhile you can explore the
                demo workspace.
              </p>
              <Button asChild size="sm" variant="outline" className="mt-3">
                <Link href="/w/demo/overview">Open demo workspace</Link>
              </Button>
            </div>
          ) : null}
          {children}
        </div>
      </div>
      <div className="relative hidden overflow-hidden border-l bg-sidebar lg:flex lg:flex-col lg:justify-end lg:p-12">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:48px_48px]"
        />
        <div className="relative max-w-md space-y-4">
          <p className="font-heading text-xs font-medium tracking-[0.2em] text-brand uppercase">Think. Create. Execute. Grow.</p>
          <h2 className="text-3xl leading-tight font-semibold">Your entire marketing department. Powered by AI.</h2>
          <p className="text-sm text-muted-foreground">
            Strategy, content, campaigns and analytics in one workspace — with every external action waiting for your approval.
          </p>
        </div>
      </div>
    </div>
  )
}
