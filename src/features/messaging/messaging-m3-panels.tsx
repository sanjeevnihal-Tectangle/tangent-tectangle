"use client"

import { CalendarClock, Loader2, Plus, Settings2, Trash2 } from "lucide-react"
import { useState, useTransition, type Dispatch, type SetStateAction } from "react"
import { toast } from "sonner"

import { EmptyState } from "@/components/states/states"
import { useCan, useWorkspace } from "@/components/workspace/workspace-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  deleteAutomationAction,
  runDueAutomationsAction,
  saveAutomationAction,
  saveMessagingSettingsAction,
} from "@/features/messaging/actions"
import type { ConnectedAccountView } from "@/lib/domain/social"
import {
  AUTOMATION_EVENT_LABELS,
  AUTOMATION_SCHEDULE_LABELS,
  AUTOMATION_SCHEDULE_PRESETS,
  CHANNEL_PROVIDER,
  defaultIntakeQuestions,
  emptyAutomation,
  emptyIntakeBranch,
  INBOX_AUTO_REPLY_MODE_LABELS,
  INBOX_AUTO_REPLY_MODES,
  INTAKE_BRANCH_ACTION_LABELS,
  INTAKE_BRANCH_ACTIONS,
  MESSAGE_CHANNEL_LABELS,
  type Audience,
  type InboxAutoReplyMode,
  type IntakeBranchAction,
  type IntakeQuestion,
  type MessageAutomation,
  type MessageChannel,
  type MessageTemplate,
  type MessagingSettings,
} from "@/lib/domain/messaging"

export function MessagingAutomationsPanel({
  automations: initial,
  setAutomations,
  templates,
  audiences,
  messagingAccounts,
  schemaReady,
}: {
  automations: MessageAutomation[]
  setAutomations: Dispatch<SetStateAction<MessageAutomation[]>>
  templates: MessageTemplate[]
  audiences: Audience[]
  messagingAccounts: ConnectedAccountView[]
  schemaReady: boolean
}) {
  const { workspace } = useWorkspace()
  const canManage = useCan("campaigns.manage")
  const [pending, startTransition] = useTransition()
  const [dialog, setDialog] = useState<MessageAutomation | null>(null)
  const approved = templates.filter((t) => t.status === "approved")

  function accountsForChannel(channel: MessageChannel) {
    const provider = CHANNEL_PROVIDER[channel]
    return messagingAccounts.filter((a) => a.provider === provider)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Scheduled and event-driven runs create broadcasts that still require approval before send.
        </p>
        <div className="flex gap-2">
          {canManage ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={!schemaReady || pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await runDueAutomationsAction(workspace.slug)
                    if (result.ok) {
                      toast.success(`Created ${result.data.ran} broadcast(s) from due automations`)
                    } else toast.error(result.error)
                  })
                }
              >
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CalendarClock className="size-3.5" />}
                Run due now
              </Button>
              <Button
                size="sm"
                disabled={!schemaReady}
                onClick={() => {
                  const tpl = approved[0]
                  const channel = tpl?.channel ?? "whatsapp"
                  const accounts = accountsForChannel(channel)
                  setDialog({
                    ...emptyAutomation(crypto.randomUUID()),
                    channel,
                    templateId: tpl?.id ?? "",
                    audienceId: audiences[0]?.id ?? "",
                    connectedAccountId: accounts[0]?.id ?? "",
                  })
                }}
              >
                <Plus className="size-3.5" /> New automation
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {initial.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No automations"
          description="Schedule daily/weekly/monthly template sends, or trigger when a lead import is accepted."
        />
      ) : (
        <div className="space-y-2">
          {initial.map((automation) => (
            <Card key={automation.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-3 pt-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{automation.name}</p>
                    <Badge variant={automation.enabled ? "success" : "muted"}>
                      {automation.enabled ? "Enabled" : "Paused"}
                    </Badge>
                    <Badge variant="muted">
                      {automation.triggerKind === "schedule"
                        ? AUTOMATION_SCHEDULE_LABELS[automation.schedulePreset ?? "daily"]
                        : AUTOMATION_EVENT_LABELS[automation.eventType ?? "lead_imported"]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {automation.triggerKind === "schedule"
                      ? `Next run ${automation.nextRunAt ? new Date(automation.nextRunAt).toLocaleString() : "—"} · ${automation.scheduleTime} ${automation.scheduleTimezone}`
                      : "Fires when a CSV/scrape import batch is accepted"}
                  </p>
                  {automation.lastError ? (
                    <p className="text-xs text-destructive">{automation.lastError}</p>
                  ) : null}
                </div>
                {canManage ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setDialog(automation)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await deleteAutomationAction(workspace.slug, automation.id)
                          if (result.ok) {
                            setAutomations((list) => list.filter((a) => a.id !== automation.id))
                          } else toast.error(result.error)
                        })
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(dialog)} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Automation</DialogTitle>
            <DialogDescription>
              Each run creates a broadcast. Approval is required before messages send.
            </DialogDescription>
          </DialogHeader>
          {dialog ? (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              <div className="space-y-1.5">
                <Label htmlFor="auto-name">Name</Label>
                <Input
                  id="auto-name"
                  value={dialog.name}
                  onChange={(e) => setDialog({ ...dialog, name: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label htmlFor="auto-enabled">Enabled</Label>
                <Switch
                  id="auto-enabled"
                  checked={dialog.enabled}
                  onCheckedChange={(enabled) => setDialog({ ...dialog, enabled })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Trigger</Label>
                <Select
                  value={dialog.triggerKind}
                  onValueChange={(v) =>
                    setDialog({
                      ...dialog,
                      triggerKind: v as MessageAutomation["triggerKind"],
                      schedulePreset: v === "schedule" ? dialog.schedulePreset ?? "daily" : null,
                      eventType: v === "event" ? "lead_imported" : null,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="schedule">Schedule</SelectItem>
                    <SelectItem value="event">Event — lead import accepted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {dialog.triggerKind === "schedule" ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Preset</Label>
                      <Select
                        value={dialog.schedulePreset ?? "daily"}
                        onValueChange={(v) =>
                          setDialog({
                            ...dialog,
                            schedulePreset: v as NonNullable<MessageAutomation["schedulePreset"]>,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AUTOMATION_SCHEDULE_PRESETS.map((p) => (
                            <SelectItem key={p} value={p}>
                              {AUTOMATION_SCHEDULE_LABELS[p]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="auto-time">Time (HH:MM)</Label>
                      <Input
                        id="auto-time"
                        value={dialog.scheduleTime}
                        onChange={(e) => setDialog({ ...dialog, scheduleTime: e.target.value })}
                      />
                    </div>
                  </div>
                  {dialog.schedulePreset === "weekly" ? (
                    <div className="space-y-1.5">
                      <Label>Day of week (1=Mon … 7=Sun)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={7}
                        value={dialog.scheduleDayOfWeek ?? 1}
                        onChange={(e) =>
                          setDialog({ ...dialog, scheduleDayOfWeek: Number(e.target.value) || 1 })
                        }
                      />
                    </div>
                  ) : null}
                  {dialog.schedulePreset === "monthly" ? (
                    <div className="space-y-1.5">
                      <Label>Day of month (1–28)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={28}
                        value={dialog.scheduleDayOfMonth ?? 1}
                        onChange={(e) =>
                          setDialog({ ...dialog, scheduleDayOfMonth: Number(e.target.value) || 1 })
                        }
                      />
                    </div>
                  ) : null}
                </>
              ) : null}
              <div className="space-y-1.5">
                <Label>Template</Label>
                <Select
                  value={dialog.templateId || undefined}
                  onValueChange={(v) => {
                    const tpl = approved.find((t) => t.id === v)
                    const channel = tpl?.channel ?? dialog.channel
                    const accounts = accountsForChannel(channel)
                    setDialog({
                      ...dialog,
                      templateId: v,
                      channel,
                      connectedAccountId: accounts[0]?.id ?? "",
                    })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Approved template" />
                  </SelectTrigger>
                  <SelectContent>
                    {approved.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {MESSAGE_CHANNEL_LABELS[t.channel]} · {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Audience</Label>
                <Select
                  value={dialog.audienceId || undefined}
                  onValueChange={(v) => setDialog({ ...dialog, audienceId: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {audiences.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{MESSAGE_CHANNEL_LABELS[dialog.channel]} account</Label>
                <Select
                  value={dialog.connectedAccountId || undefined}
                  onValueChange={(v) => setDialog({ ...dialog, connectedAccountId: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accountsForChannel(dialog.channel).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label htmlFor="auto-approval">Require approval each run</Label>
                <Switch
                  id="auto-approval"
                  checked={dialog.requireApprovalEachRun}
                  onCheckedChange={(requireApprovalEachRun) =>
                    setDialog({ ...dialog, requireApprovalEachRun })
                  }
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !dialog}
              onClick={() =>
                startTransition(async () => {
                  if (!dialog) return
                  const result = await saveAutomationAction(workspace.slug, dialog)
                  if (result.ok) {
                    setAutomations((list) => [result.data, ...list.filter((a) => a.id !== result.data.id)])
                    setDialog(null)
                    toast.success("Automation saved")
                  } else toast.error(result.error)
                })
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function MessagingSettingsPanel({
  settings: initial,
  setSettings,
  inboxAccounts = [],
}: {
  settings: MessagingSettings
  setSettings: Dispatch<SetStateAction<MessagingSettings>>
  /** Connected inbox channels (WhatsApp, Instagram, …) used for auto-replies. */
  inboxAccounts?: ConnectedAccountView[]
}) {
  const { workspace } = useWorkspace()
  const canManage = useCan("campaigns.manage")
  const [draft, setDraft] = useState(initial)
  const [pending, startTransition] = useTransition()
  /** Raw keyword text while typing — avoids eating commas when round-tripping through arrays. */
  const [keywordDrafts, setKeywordDrafts] = useState<Record<string, string>>({})

  function parseKeywordList(raw: string): string[] {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  }

  function updateBranchKeywords(questionId: string, branchId: string, raw: string) {
    setKeywordDrafts((prev) => ({ ...prev, [branchId]: raw }))
    const keywords = parseKeywordList(raw)
    setDraft((current) => ({
      ...current,
      intakeQuestions: current.intakeQuestions.map((q) =>
        q.id === questionId
          ? {
              ...q,
              branches: (q.branches ?? []).map((b) =>
                b.id === branchId ? { ...b, keywords } : b
              ),
            }
          : q
      ),
    }))
  }

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="size-4" /> Inbox AI & auto-reply
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Applies to every connected inbox channel (WhatsApp, Instagram, and others as they come
          online). Each chat replies from the account that received the message.
        </p>
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <div>
            <p className="text-sm font-medium">Understand inbound with AI</p>
            <p className="text-xs text-muted-foreground">
              Classifies intent and drafts replies when messages arrive on any connected channel.
            </p>
          </div>
          <Switch
            checked={draft.inboxAiEnabled}
            disabled={!canManage}
            onCheckedChange={(inboxAiEnabled) => setDraft({ ...draft, inboxAiEnabled })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Auto-reply mode</Label>
          <Select
            value={draft.autoReplyMode}
            onValueChange={(v) =>
              setDraft({ ...draft, autoReplyMode: v as InboxAutoReplyMode })
            }
            disabled={!canManage}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INBOX_AUTO_REPLY_MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {INBOX_AUTO_REPLY_MODE_LABELS[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Auto-FAQ sends on high-confidence pricing/hours/product/greeting intents across channels.
            Everything else stays as an AI draft unless intake auto-send is on.
          </p>
        </div>
        {inboxAccounts.length > 0 ? (
          <div className="space-y-1.5">
            <Label>Preferred send account (optional)</Label>
            <Select
              value={draft.autoReplyConnectedAccountId ?? "none"}
              onValueChange={(v) =>
                setDraft({
                  ...draft,
                  autoReplyConnectedAccountId: v === "none" ? null : v,
                })
              }
              disabled={!canManage}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Use the account that received the message</SelectItem>
                {inboxAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.provider} · {account.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Leave as “received account” so Instagram DMs reply via Instagram and WhatsApp via
              WhatsApp. Only override if you intentionally want one default sender.
            </p>
          </div>
        ) : (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Connect WhatsApp and/or Instagram under Integrations so auto-replies have a send
            account.
          </p>
        )}
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="size-4" /> Intake flow (welcome → qualify)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <div>
            <p className="text-sm font-medium">Use guided intake on new chats</p>
            <p className="text-xs text-muted-foreground">
              First reply is your welcome message, then your qualification questions (e.g. business
              type) on WhatsApp, Instagram, and any other inbox channel. After that, normal FAQ AI
              continues.
            </p>
          </div>
          <Switch
            checked={draft.intakeFlowEnabled}
            disabled={!canManage}
            onCheckedChange={(intakeFlowEnabled) => setDraft({ ...draft, intakeFlowEnabled })}
          />
        </div>
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <div>
            <p className="text-sm font-medium">Auto-send intake messages</p>
            <p className="text-xs text-muted-foreground">
              When on, welcome/questions send automatically. When off, they appear as AI drafts for
              you to send.
            </p>
          </div>
          <Switch
            checked={draft.intakeAutoSend}
            disabled={!canManage || !draft.intakeFlowEnabled}
            onCheckedChange={(intakeAutoSend) => setDraft({ ...draft, intakeAutoSend })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Welcome message</Label>
          <Textarea
            rows={4}
            disabled={!canManage || !draft.intakeFlowEnabled}
            value={draft.intakeWelcomeMessage}
            onChange={(e) => setDraft({ ...draft, intakeWelcomeMessage: e.target.value })}
            placeholder="Hi! Thanks for reaching out…"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Qualification questions</Label>
            {canManage && draft.intakeFlowEnabled ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const next: IntakeQuestion = {
                    id: crypto.randomUUID().slice(0, 8),
                    key: `question_${(draft.intakeQuestions?.length ?? 0) + 1}`,
                    prompt: "",
                    branches: [],
                    fallbackAction: "next_question",
                    fallbackReplyMessage: "",
                    fallbackGotoQuestionId: null,
                  }
                  setDraft({
                    ...draft,
                    intakeQuestions: [...(draft.intakeQuestions ?? []), next],
                  })
                }}
              >
                <Plus className="size-3.5" /> Add question
              </Button>
            ) : null}
          </div>
          {(draft.intakeQuestions ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No questions yet.{" "}
              {canManage ? (
                <button
                  type="button"
                  className="underline"
                  onClick={() =>
                    setDraft({ ...draft, intakeQuestions: defaultIntakeQuestions() })
                  }
                >
                  Load laundry yes/no example
                </button>
              ) : null}
            </p>
          ) : (
            <div className="space-y-3">
              {(draft.intakeQuestions ?? []).map((question, index) => (
                <div
                  key={question.id}
                  className="space-y-3 rounded-md border border-border/70 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Step {index + 1}
                      {index === 0 ? " (sent with welcome)" : ""}
                    </p>
                    {canManage ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            intakeQuestions: draft.intakeQuestions.filter((q) => q.id !== question.id),
                          })
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
                    <div className="space-y-1">
                      <Label className="text-xs">Answer key</Label>
                      <Input
                        disabled={!canManage || !draft.intakeFlowEnabled}
                        value={question.key}
                        onChange={(e) => {
                          const key = e.target.value
                          setDraft({
                            ...draft,
                            intakeQuestions: draft.intakeQuestions.map((q) =>
                              q.id === question.id ? { ...q, key } : q
                            ),
                          })
                        }}
                        placeholder="business_type"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Question</Label>
                      <Textarea
                        rows={2}
                        disabled={!canManage || !draft.intakeFlowEnabled}
                        value={question.prompt}
                        onChange={(e) => {
                          const prompt = e.target.value
                          setDraft({
                            ...draft,
                            intakeQuestions: draft.intakeQuestions.map((q) =>
                              q.id === question.id ? { ...q, prompt } : q
                            ),
                          })
                        }}
                        placeholder="Please confirm if you are into the laundry business"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 rounded-md border border-dashed border-border/60 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium">If they answer… (branches)</p>
                      {canManage && draft.intakeFlowEnabled ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              intakeQuestions: draft.intakeQuestions.map((q) =>
                                q.id === question.id
                                  ? {
                                      ...q,
                                      branches: [...(q.branches ?? []), emptyIntakeBranch()],
                                    }
                                  : q
                              ),
                            })
                          }
                        >
                          <Plus className="size-3.5" /> Add branch
                        </Button>
                      ) : null}
                    </div>
                    {(question.branches ?? []).length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">
                        No branches yet — every answer uses the fallback below. Add a “Yes” and
                        “No” branch to change the reply by answer.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {(question.branches ?? []).map((branch) => (
                          <div
                            key={branch.id}
                            className="space-y-2 rounded-md bg-muted/30 p-2.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <Input
                                className="h-8"
                                disabled={!canManage || !draft.intakeFlowEnabled}
                                value={branch.label}
                                placeholder="Label (e.g. Yes / laundry)"
                                onChange={(e) => {
                                  const label = e.target.value
                                  setDraft({
                                    ...draft,
                                    intakeQuestions: draft.intakeQuestions.map((q) =>
                                      q.id === question.id
                                        ? {
                                            ...q,
                                            branches: (q.branches ?? []).map((b) =>
                                              b.id === branch.id ? { ...b, label } : b
                                            ),
                                          }
                                        : q
                                    ),
                                  })
                                }}
                              />
                              {canManage ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setKeywordDrafts((prev) => {
                                      const next = { ...prev }
                                      delete next[branch.id]
                                      return next
                                    })
                                    setDraft({
                                      ...draft,
                                      intakeQuestions: draft.intakeQuestions.map((q) =>
                                        q.id === question.id
                                          ? {
                                              ...q,
                                              branches: (q.branches ?? []).filter(
                                                (b) => b.id !== branch.id
                                              ),
                                            }
                                          : q
                                      ),
                                    })
                                  }}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              ) : null}
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Match keywords (comma-separated)</Label>
                              <Input
                                disabled={!canManage || !draft.intakeFlowEnabled}
                                value={
                                  keywordDrafts[branch.id] ??
                                  (branch.keywords ?? []).join(", ")
                                }
                                placeholder="yes, yeah, yep, laundry"
                                onChange={(e) =>
                                  updateBranchKeywords(question.id, branch.id, e.target.value)
                                }
                                onBlur={() => {
                                  const raw =
                                    keywordDrafts[branch.id] ??
                                    (branch.keywords ?? []).join(", ")
                                  const keywords = parseKeywordList(raw)
                                  setDraft((current) => ({
                                    ...current,
                                    intakeQuestions: current.intakeQuestions.map((q) =>
                                      q.id === question.id
                                        ? {
                                            ...q,
                                            branches: (q.branches ?? []).map((b) =>
                                              b.id === branch.id ? { ...b, keywords } : b
                                            ),
                                          }
                                        : q
                                    ),
                                  }))
                                  setKeywordDrafts((prev) => {
                                    const next = { ...prev }
                                    delete next[branch.id]
                                    return next
                                  })
                                }}
                              />
                              <p className="text-[10px] text-muted-foreground">
                                Type several words separated by commas, e.g.{" "}
                                <span className="text-foreground">yes, yeah, yep</span>
                              </p>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Reply to send</Label>
                              <Textarea
                                rows={2}
                                disabled={!canManage || !draft.intakeFlowEnabled}
                                value={branch.replyMessage}
                                placeholder="Great! Here’s how we help laundry businesses…"
                                onChange={(e) => {
                                  const replyMessage = e.target.value
                                  setDraft({
                                    ...draft,
                                    intakeQuestions: draft.intakeQuestions.map((q) =>
                                      q.id === question.id
                                        ? {
                                            ...q,
                                            branches: (q.branches ?? []).map((b) =>
                                              b.id === branch.id ? { ...b, replyMessage } : b
                                            ),
                                          }
                                        : q
                                    ),
                                  })
                                }}
                              />
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <div className="space-y-1">
                                <Label className="text-xs">Then</Label>
                                <Select
                                  value={branch.action}
                                  disabled={!canManage || !draft.intakeFlowEnabled}
                                  onValueChange={(v) => {
                                    const action = v as IntakeBranchAction
                                    setDraft({
                                      ...draft,
                                      intakeQuestions: draft.intakeQuestions.map((q) =>
                                        q.id === question.id
                                          ? {
                                              ...q,
                                              branches: (q.branches ?? []).map((b) =>
                                                b.id === branch.id ? { ...b, action } : b
                                              ),
                                            }
                                          : q
                                      ),
                                    })
                                  }}
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {INTAKE_BRANCH_ACTIONS.map((action) => (
                                      <SelectItem key={action} value={action}>
                                        {INTAKE_BRANCH_ACTION_LABELS[action]}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <p className="text-[10px] text-muted-foreground">
                                  For a link / demo reply after “Yes”, choose{" "}
                                  <span className="text-foreground">Send reply and end intake</span>
                                  .
                                </p>
                              </div>
                              {branch.action === "goto_question" ? (
                                <div className="space-y-1">
                                  <Label className="text-xs">Go to question</Label>
                                  <Select
                                    value={branch.gotoQuestionId ?? "none"}
                                    disabled={!canManage || !draft.intakeFlowEnabled}
                                    onValueChange={(v) =>
                                      setDraft({
                                        ...draft,
                                        intakeQuestions: draft.intakeQuestions.map((q) =>
                                          q.id === question.id
                                            ? {
                                                ...q,
                                                branches: (q.branches ?? []).map((b) =>
                                                  b.id === branch.id
                                                    ? {
                                                        ...b,
                                                        gotoQuestionId: v === "none" ? null : v,
                                                      }
                                                    : b
                                                ),
                                              }
                                            : q
                                        ),
                                      })
                                    }
                                  >
                                    <SelectTrigger className="h-8">
                                      <SelectValue placeholder="Pick question" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">Select…</SelectItem>
                                      {draft.intakeQuestions
                                        .filter((q) => q.id !== question.id)
                                        .map((q) => (
                                          <SelectItem key={q.id} value={q.id}>
                                            Step{" "}
                                            {draft.intakeQuestions.findIndex((x) => x.id === q.id) +
                                              1}
                                            : {q.prompt.slice(0, 40) || q.key}
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="space-y-2 border-t border-border/50 pt-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        If no keywords match (fallback)
                      </p>
                      <div className="space-y-1">
                        <Label className="text-xs">Fallback reply</Label>
                        <Textarea
                          rows={2}
                          disabled={!canManage || !draft.intakeFlowEnabled}
                          value={question.fallbackReplyMessage ?? ""}
                          placeholder="Thanks for sharing."
                          onChange={(e) => {
                            const fallbackReplyMessage = e.target.value
                            setDraft({
                              ...draft,
                              intakeQuestions: draft.intakeQuestions.map((q) =>
                                q.id === question.id ? { ...q, fallbackReplyMessage } : q
                              ),
                            })
                          }}
                        />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Fallback then</Label>
                          <Select
                            value={question.fallbackAction ?? "next_question"}
                            disabled={!canManage || !draft.intakeFlowEnabled}
                            onValueChange={(v) => {
                              const fallbackAction = v as IntakeBranchAction
                              setDraft({
                                ...draft,
                                intakeQuestions: draft.intakeQuestions.map((q) =>
                                  q.id === question.id ? { ...q, fallbackAction } : q
                                ),
                              })
                            }}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {INTAKE_BRANCH_ACTIONS.map((action) => (
                                <SelectItem key={action} value={action}>
                                  {INTAKE_BRANCH_ACTION_LABELS[action]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {(question.fallbackAction ?? "next_question") === "goto_question" ? (
                          <div className="space-y-1">
                            <Label className="text-xs">Go to question</Label>
                            <Select
                              value={question.fallbackGotoQuestionId ?? "none"}
                              disabled={!canManage || !draft.intakeFlowEnabled}
                              onValueChange={(v) =>
                                setDraft({
                                  ...draft,
                                  intakeQuestions: draft.intakeQuestions.map((q) =>
                                    q.id === question.id
                                      ? {
                                          ...q,
                                          fallbackGotoQuestionId: v === "none" ? null : v,
                                        }
                                      : q
                                  ),
                                })
                              }
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Select…</SelectItem>
                                {draft.intakeQuestions
                                  .filter((q) => q.id !== question.id)
                                  .map((q) => (
                                    <SelectItem key={q.id} value={q.id}>
                                      {q.prompt.slice(0, 40) || q.key}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Example: ask if they are a laundry business → Yes gets a laundry-specific reply; No asks
            what industry they are in. Keywords are matched as substrings (case-insensitive).
          </p>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="size-4" /> Quiet hours & opt-out
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <div>
            <p className="text-sm font-medium">Quiet hours</p>
            <p className="text-xs text-muted-foreground">Blocks executes and due automations overnight.</p>
          </div>
          <Switch
            checked={draft.quietHoursEnabled}
            disabled={!canManage}
            onCheckedChange={(quietHoursEnabled) => setDraft({ ...draft, quietHoursEnabled })}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Start</Label>
            <Input
              value={draft.quietHoursStart}
              disabled={!canManage}
              onChange={(e) => setDraft({ ...draft, quietHoursStart: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>End</Label>
            <Input
              value={draft.quietHoursEnd}
              disabled={!canManage}
              onChange={(e) => setDraft({ ...draft, quietHoursEnd: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Input
              value={draft.timezone}
              disabled={!canManage}
              onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Opt-out keywords (comma-separated)</Label>
          <Textarea
            rows={2}
            disabled={!canManage}
            value={draft.optOutKeywords.join(", ")}
            onChange={(e) =>
              setDraft({
                ...draft,
                optOutKeywords: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            Inbound WhatsApp replies matching these keywords opt the contact out via webhook.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Default template language</Label>
          <Input
            value={draft.defaultLanguage}
            disabled={!canManage}
            onChange={(e) => setDraft({ ...draft, defaultLanguage: e.target.value })}
          />
        </div>
        {canManage ? (
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await saveMessagingSettingsAction(workspace.slug, draft)
                if (result.ok) {
                  setSettings(result.data)
                  setDraft(result.data)
                  toast.success("Messaging settings saved")
                } else toast.error(result.error)
              })
            }
          >
            Save settings
          </Button>
        ) : null}
      </CardContent>
    </Card>
    </div>
  )
}
