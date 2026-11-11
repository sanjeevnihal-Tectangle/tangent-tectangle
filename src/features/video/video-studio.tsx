"use client"

import {
  ArrowLeft,
  CalendarPlus,
  Check,
  Clapperboard,
  Copy,
  Film,
  Loader2,
  Music,
  Palette,
  Sparkles,
} from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { PageHeader } from "@/components/page/page-header"
import { EmptyState, NotConfigured } from "@/components/states/states"
import { useCan, useWorkspace } from "@/components/workspace/workspace-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  generateVideoScript,
  saveVideoScriptToPlanner,
} from "@/features/video/actions"
import type { VideoOutput } from "@/lib/ai/outputs"
import { workspaceHref } from "@/lib/navigation"

const VIDEO_PLATFORMS = [
  "Instagram Reel",
  "YouTube Short",
  "Facebook Reel",
] as const

const DURATION_OPTIONS = [15, 30, 45, 60] as const

export function VideoStudio() {
  const { workspace, aiConfigured } = useWorkspace()
  const canRunAi = useCan("ai.run")
  const canCreateContent = useCan("content.create")

  const [platform, setPlatform] = useState<(typeof VIDEO_PLATFORMS)[number]>(
    "Instagram Reel"
  )
  const [durationSeconds, setDurationSeconds] = useState<number>(30)
  const [topic, setTopic] = useState("")
  const [guidance, setGuidance] = useState("")
  const [script, setScript] = useState<VideoOutput | null>(null)
  const [copied, setCopied] = useState(false)

  const [generating, startGenerating] = useTransition()
  const [saving, startSaving] = useTransition()

  const handleGenerate = () => {
    if (topic.trim().length < 5) {
      toast.error("Describe what the Reel or Short is about (at least 5 characters).")
      return
    }
    startGenerating(async () => {
      const res = await generateVideoScript(workspace.slug, {
        platform,
        topic,
        durationSeconds,
        guidance,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setScript(res.data)
      toast.success("Video script & storyboard generated.")
    })
  }

  const handleSaveToPlanner = () => {
    if (!script) return
    startSaving(async () => {
      const res = await saveVideoScriptToPlanner(workspace.slug, script)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Saved storyboard as a draft in Content Planner.")
    })
  }

  const handleCopyFullScript = async () => {
    if (!script) return
    const text = [
      `# ${script.title} (${script.platform} · ${script.totalDurationSeconds}s)`,
      `Hook (0–3s): ${script.hook}`,
      "",
      ...script.scenes.map(
        (s) =>
          `Scene ${s.sceneNumber} (${s.durationSeconds}s)\nVisual: ${s.visualDirection}\nVoiceover: "${s.voiceoverOrDialogue}"\nOn-screen text: ${s.onScreenText}`
      ),
      "",
      `Audio cue: ${script.audioDirection}`,
      `CTA: ${script.callToAction}`,
      "",
      `Caption:\n${script.caption}`,
      "",
      script.hashtags.join(" "),
    ].join("\n")

    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success("Copied full production script to clipboard.")
  }

  const coverFormat =
    platform === "YouTube Short" ? "youtube_thumbnail" : "instagram_reel"

  return (
    <div className="space-y-6">
      <PageHeader
        title="Video Studio — Reels & Shorts"
        description="Generate high-retention 0–3s hooks, scene-by-scene visual storyboards, voiceover scripts, and on-screen text overlays grounded in your brand voice."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={workspaceHref(workspace.slug, "studio")}>
                <ArrowLeft className="size-3.5" />
                Back to Studio
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link
                href={`${workspaceHref(workspace.slug, "studio")}/new?format=${coverFormat}`}
              >
                <Palette className="size-3.5" />
                Design cover frame
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clapperboard className="size-4 text-primary" />
              Short-form video brief
            </CardTitle>
            <CardDescription>
              The Video Creation Agent plans scene pacing, camera framing, voiceover lines, and on-screen kinetic text.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!aiConfigured ? (
              <NotConfigured
                title="AI Video Script & Storyboard Generator is not configured"
                envVars={["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]}
                description="Add an AI provider key to generate short-form video scripts and storyboards."
              />
            ) : (
              <fieldset
                disabled={!canRunAi || generating}
                className="min-w-0 space-y-4"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Format</Label>
                    <Select
                      value={platform}
                      onValueChange={(v) =>
                        setPlatform(v as (typeof VIDEO_PLATFORMS)[number])
                      }
                    >
                      <SelectTrigger>
                        <SelectValue>{platform}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {VIDEO_PLATFORMS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Target duration</Label>
                    <Select
                      value={String(durationSeconds)}
                      onValueChange={(v) => setDurationSeconds(Number(v))}
                    >
                      <SelectTrigger>
                        <SelectValue>{durationSeconds} seconds</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {DURATION_OPTIONS.map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {d} seconds
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="video-topic">
                    What is this Reel or Short about?
                  </Label>
                  <Textarea
                    id="video-topic"
                    rows={4}
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. Behind the scenes of how our single-origin Chikmagalur roast is small-batch roasted every Tuesday morning and shipped within 24 hours."
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="video-guidance">
                    Visual style or hook angle (optional)
                  </Label>
                  <Input
                    id="video-guidance"
                    value={guidance}
                    onChange={(e) => setGuidance(e.target.value)}
                    placeholder="e.g. Fast cuts, founder talking to camera, warm morning light"
                  />
                </div>

                <Button
                  type="button"
                  className="w-full"
                  disabled={!canRunAi || generating}
                  onClick={handleGenerate}
                >
                  {generating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  Generate script & storyboard
                </Button>
              </fieldset>
            )}

            <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                Production & rendering status:{" "}
              </span>
              Automated MP4 rendering requires configuring an external video rendering provider (`VIDEO_PROVIDER`). Use the scene storyboard below to shoot or edit on mobile/desktop, design the cover frame in Creative Studio, and send the production sheet to Content Planner.
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">
                  {script ? script.title : "Scene-by-scene storyboard"}
                </CardTitle>
                <CardDescription>
                  {script
                    ? `${script.platform} · ${script.totalDurationSeconds}s total · ${script.scenes.length} scenes`
                    : "Your generated hook, shot list, voiceover lines, and caption will appear here."}
                </CardDescription>
              </div>
              {script ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyFullScript}
                  >
                    {copied ? (
                      <Check className="size-3.5" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    Copy script
                  </Button>
                  {canCreateContent ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={saving}
                      onClick={handleSaveToPlanner}
                    >
                      {saving ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <CalendarPlus className="size-3.5" />
                      )}
                      Save to Planner
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {!script ? (
              <EmptyState
                icon={Film}
                title="No storyboard generated yet"
                description="Enter a topic on the left and click Generate script & storyboard to build a ready-to-shoot Reel or Short."
              />
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-primary/25 bg-primary/5 p-3.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                    0–3s Scroll-Stopping Hook
                  </div>
                  <p className="mt-1 font-medium text-sm">{script.hook}</p>
                </div>

                <div className="space-y-2.5">
                  {script.scenes.map((scene) => (
                    <div
                      key={scene.sceneNumber}
                      className="rounded-lg border p-3.5 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm">
                          Scene {scene.sceneNumber}
                        </span>
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {scene.durationSeconds}s
                        </Badge>
                      </div>
                      <div>
                        <span className="font-medium text-muted-foreground">
                          Camera / Visual:{" "}
                        </span>
                        <span>{scene.visualDirection}</span>
                      </div>
                      <div>
                        <span className="font-medium text-muted-foreground">
                          Voiceover:{" "}
                        </span>
                        <span className="italic">&ldquo;{scene.voiceoverOrDialogue}&rdquo;</span>
                      </div>
                      <div className="rounded bg-muted/50 px-2.5 py-1.5 font-medium">
                        On-screen text: {scene.onScreenText}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 text-xs">
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Music className="size-3.5 text-primary" />
                      Audio & pacing cue
                    </div>
                    <p className="mt-1 text-muted-foreground">{script.audioDirection}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="font-medium">Call to action</div>
                    <p className="mt-1 text-muted-foreground">
                      {script.callToAction}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border p-3 text-xs space-y-2">
                  <div className="font-medium">Post caption & hashtags</div>
                  <p className="whitespace-pre-line text-muted-foreground">
                    {script.caption}
                  </p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {script.hashtags.map((tag, idx) => (
                      <Badge key={idx} variant="outline" className="text-[10px]">
                        {tag.startsWith("#") ? tag : `#${tag}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
