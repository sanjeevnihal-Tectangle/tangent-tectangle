"use client"

import { addMonths, format as formatDate } from "date-fns"
import { Loader2, Sparkles } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { useWorkspace } from "@/components/workspace/workspace-provider"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { generateCalendar } from "@/features/planner/actions"
import { CONTENT_PLATFORM_LABELS, CONTENT_PLATFORMS, type ContentItem, type ContentPlatform } from "@/lib/domain/content"

export function GenerateCalendarDialog({
  open,
  onOpenChange,
  anchor,
  onGenerated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  anchor: Date
  onGenerated: (items: ContentItem[], month: string) => void
}) {
  const { workspace } = useWorkspace()
  const months = [0, 1, 2].map((offset) => addMonths(anchor, offset))
  const [month, setMonth] = useState(formatDate(anchor, "yyyy-MM"))
  const [platforms, setPlatforms] = useState<ContentPlatform[]>(["instagram", "facebook"])
  const [postsPerWeek, setPostsPerWeek] = useState(4)
  const [focus, setFocus] = useState("")
  const [pending, startTransition] = useTransition()

  const run = () =>
    startTransition(async () => {
      const result = await generateCalendar(workspace.slug, { month, platforms, postsPerWeek, focus })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`${result.data.length} draft posts added for review`)
      onGenerated(result.data, month)
      onOpenChange(false)
    })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate a content calendar</DialogTitle>
          <DialogDescription>The Copywriter drafts a month of posts from your business profile and brand voice. Everything is saved as drafts for review — nothing is published.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-full"><SelectValue>{formatDate(new Date(`${month}-01T12:00:00`), "MMMM yyyy")}</SelectValue></SelectTrigger>
                <SelectContent>
                  {months.map((m) => <SelectItem key={formatDate(m, "yyyy-MM")} value={formatDate(m, "yyyy-MM")}>{formatDate(m, "MMMM yyyy")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ppw">Posts per week</Label>
              <Input id="ppw" type="number" min={1} max={14} value={postsPerWeek} onChange={(e) => setPostsPerWeek(Math.max(1, Math.min(14, Number(e.target.value) || 1)))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Platforms</Label>
            <div className="flex flex-wrap gap-3">
              {CONTENT_PLATFORMS.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={platforms.includes(p)} onCheckedChange={(on) => setPlatforms((list) => (on ? [...list, p] : list.filter((x) => x !== p)))} />
                  {CONTENT_PLATFORM_LABELS[p]}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="focus">Focus (optional)</Label>
            <Textarea id="focus" rows={2} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. Christmas brunch pre-bookings and the winter menu" maxLength={500} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="brand" onClick={run} disabled={pending || platforms.length === 0}>
            {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {pending ? "Planning the month…" : "Generate drafts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
