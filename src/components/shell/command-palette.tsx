"use client"

import { Search, Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { useWorkspace } from "@/components/workspace/workspace-provider"
import { Button } from "@/components/ui/button"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { NAV_GROUPS, workspaceHref } from "@/lib/navigation"

const QUICK_PROMPTS = [
  "Create a 30-day marketing strategy for my business",
  "Create 10 Instagram posts for this month",
  "Prepare a Google Ads campaign with a ₹500 daily budget",
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const { workspace } = useWorkspace()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="hidden w-56 justify-start gap-2 text-muted-foreground md:inline-flex"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left font-normal">Search or jump to…</span>
        <kbd className="rounded border bg-muted px-1.5 font-mono text-[0.65rem]">Ctrl K</kbd>
      </Button>
      <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setOpen(true)} aria-label="Search">
        <Search />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search Tangent" description="Jump to a module or ask Tangent">
        <CommandInput placeholder="Type a module or an instruction…" />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          <CommandGroup heading="Ask Tangent">
            {QUICK_PROMPTS.map((prompt) => (
              <CommandItem
                key={prompt}
                onSelect={() =>
                  go(`${workspaceHref(workspace.slug, "command-centre")}?prompt=${encodeURIComponent(prompt)}`)
                }
              >
                <Sparkles className="text-brand" />
                {prompt}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          {NAV_GROUPS.map((group) => (
            <CommandGroup key={group.label} heading={group.label}>
              {group.items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.label} ${item.description}`}
                  onSelect={() => go(workspaceHref(workspace.slug, item.segment))}
                >
                  <item.icon />
                  <span>{item.label}</span>
                  {item.status === "planned" ? (
                    <span className="ml-auto text-xs text-muted-foreground">Phase {item.phase}</span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  )
}
