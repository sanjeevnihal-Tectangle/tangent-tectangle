"use client"

import { Inbox, Loader2, RefreshCw, Sparkles, Send } from "lucide-react"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import { EmptyState } from "@/components/states/states"
import { useCan, useWorkspace } from "@/components/workspace/workspace-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  draftInboxReplyAction,
  enableInstagramLiveInboxAction,
  listInboxThreadsAction,
  openInboxThreadAction,
  sendInboxReplyAction,
  syncInstagramInboxAction,
} from "@/features/messaging/actions"
import type { ConnectedAccountView } from "@/lib/domain/social"
import {
  INBOX_CHANNEL_LABELS,
  type ConversationMessage,
  type ConversationThread,
} from "@/lib/domain/messaging"

export function MessagingInboxPanel({
  whatsappAccounts,
  instagramAccounts = [],
}: {
  whatsappAccounts: ConnectedAccountView[]
  instagramAccounts?: ConnectedAccountView[]
}) {
  const { workspace } = useWorkspace()
  const canManage = useCan("campaigns.manage")
  const canPublish = useCan("content.publish")
  const [pending, startTransition] = useTransition()
  const [threads, setThreads] = useState<ConversationThread[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [selectedThread, setSelectedThread] = useState<ConversationThread | null>(null)
  const [reply, setReply] = useState("")
  const [loaded, setLoaded] = useState(false)
  const [liveHint, setLiveHint] = useState<string | null>(null)
  const [livePollEnabled, setLivePollEnabled] = useState(true)

  async function refreshThreads(silent = false) {
    const result = await listInboxThreadsAction(workspace.slug)
    if (result.ok) {
      setThreads(result.data)
      setLoaded(true)
      return
    }
    setLoaded(true)
    if (!silent && !/relation|does not exist|schema/i.test(result.error)) {
      toast.error(result.error)
    }
  }

  async function pullFromInstagram(silent = false) {
    const result = await syncInstagramInboxAction(workspace.slug, instagramAccounts[0]?.id)
    if (!result.ok) {
      if (!silent) toast.error(result.error)
      return
    }
    await refreshThreads(true)
    if (selectedId) {
      const opened = await openInboxThreadAction(workspace.slug, selectedId)
      if (opened.ok) {
        setSelectedThread(opened.data.thread)
        setMessages(opened.data.messages)
      }
    }
    if (!silent) {
      toast.success(
        `Live pull · ${result.data.conversations} chats · ${result.data.messages} msgs · ${result.data.comments} comments`
      )
    }
  }

  useEffect(() => {
    let cancelled = false
    startTransition(async () => {
      if (cancelled) return
      await refreshThreads(true)
      // First Meta pull so Inbox isn't empty after open.
      if (canManage) await pullFromInstagram(true)
    })
    return () => {
      cancelled = true
    }
  }, [workspace.slug])

  // While Inbox is open: refresh DB + pull new Instagram messages from Meta.
  // Needed on localhost where Meta cannot push webhooks to your machine.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return
      void refreshThreads(true)
      if (livePollEnabled && canManage) void pullFromInstagram(true)
      else if (selectedId) {
        void openInboxThreadAction(workspace.slug, selectedId).then((result) => {
          if (result.ok) {
            setSelectedThread(result.data.thread)
            setMessages(result.data.messages)
          }
        })
      }
    }, 15000)
    return () => window.clearInterval(id)
  }, [workspace.slug, selectedId, livePollEnabled, canManage, instagramAccounts])

  function openThread(threadId: string) {
    startTransition(async () => {
      const result = await openInboxThreadAction(workspace.slug, threadId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setSelectedId(threadId)
      setSelectedThread(result.data.thread)
      setMessages(result.data.messages)
      setThreads((list) =>
        list.map((t) => (t.id === threadId ? { ...result.data.thread } : t))
      )
      const latestDraft = [...result.data.messages]
        .reverse()
        .find((m) => m.direction === "inbound" && m.aiDraftReply)?.aiDraftReply
      setReply(latestDraft ?? "")
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <p className="text-sm text-muted-foreground">
            All customer conversations land here. AI classifies intent and drafts replies. Configure
            auto-FAQ under <span className="font-medium text-foreground">Settings</span>.
          </p>
          <p className="text-[11px] text-muted-foreground">
            {livePollEnabled
              ? "Live Meta polling is ON while this tab is open (~15s). Keep Inbox visible to see new Instagram DMs/comments."
              : "Live polling is off — use Sync Instagram or Enable live Instagram."}
          </p>
          {liveHint ? (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 break-all">{liveHint}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Note: Meta push webhooks cannot reach localhost. Polling covers local/dev; use a public
              HTTPS URL for true push.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={pending || !canManage}
            onClick={() =>
              startTransition(async () => {
                const result = await enableInstagramLiveInboxAction(
                  workspace.slug,
                  instagramAccounts[0]?.id
                )
                if (!result.ok) {
                  toast.error(result.error)
                  setLiveHint(result.error)
                  return
                }
                setLivePollEnabled(true)
                if (result.data.mode === "poll") {
                  setLiveHint(result.data.detail ?? "Live poll mode (localhost).")
                  toast.success("Live Instagram polling enabled for this session")
                  await pullFromInstagram(true)
                } else {
                  setLiveHint(
                    `Webhook: ${result.data.callbackUrl} (verify: ${result.data.verifyTokenHint})`
                  )
                  toast.success("Instagram webhook live inbox enabled")
                }
              })
            }
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            Enable live Instagram
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !canManage}
            onClick={() =>
              startTransition(async () => {
                const result = await syncInstagramInboxAction(
                  workspace.slug,
                  instagramAccounts[0]?.id
                )
                if (!result.ok) {
                  toast.error(result.error)
                  return
                }
                toast.success(
                  `Backfill ${result.data.conversations} chats · ${result.data.messages} messages · ${result.data.comments} comments`
                )
                await refreshThreads(true)
              })
            }
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Sync Instagram
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await refreshThreads(false)
              })
            }
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Inbox className="size-3.5" />}
            Refresh
          </Button>
        </div>
      </div>

      {!loaded ? (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> Loading inbox…
        </div>
      ) : threads.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            icon={Inbox}
            title="No conversations yet"
            description="Pull Instagram DMs/comments with Sync Instagram, or wait for WhatsApp webhook messages."
          />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending || !canManage}
              onClick={() =>
                startTransition(async () => {
                  const result = await syncInstagramInboxAction(
                    workspace.slug,
                    instagramAccounts[0]?.id
                  )
                  if (!result.ok) {
                    toast.error(result.error)
                    return
                  }
                  toast.success(
                    `Synced ${result.data.conversations} chats · ${result.data.messages} messages · ${result.data.comments} comments`
                  )
                  const refreshed = await listInboxThreadsAction(workspace.slug)
                  if (refreshed.ok) setThreads(refreshed.data)
                })
              }
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Sync Instagram now
            </Button>
          </div>
          <div className="rounded-md border border-border/70 bg-muted/20 p-4 text-sm">
            <p className="font-medium">How to use Inbox + AI</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-muted-foreground">
              <li>
                Run <code className="text-foreground">20261120000100_messaging_inbox.sql</code> in
                Supabase (once) if you have not already.
              </li>
              <li>
                Instagram: Integrations → Attach token with{" "}
                <span className="text-foreground">instagram_manage_messages</span> +{" "}
                <span className="text-foreground">pages_messaging</span>, then click{" "}
                <span className="text-foreground">Sync Instagram</span>.
              </li>
              <li>
                WhatsApp: keep webhook on Tangent, then message your business number from a phone.
              </li>
              <li>
                Open a thread → <span className="text-foreground">AI draft</span> →{" "}
                <span className="text-foreground">Send reply</span>. Auto-FAQ is under Settings.
              </li>
            </ol>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="max-h-[560px] space-y-1 overflow-y-auto rounded-md border border-border/70 p-1">
            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => openThread(thread.id)}
                className={`w-full rounded-md px-3 py-2.5 text-left transition-colors ${
                  selectedId === thread.id ? "bg-muted" : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">
                    {thread.participantName || thread.participantHandle}
                  </p>
                  {thread.unreadCount > 0 ? (
                    <Badge variant="brand">{thread.unreadCount}</Badge>
                  ) : null}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <Badge variant="muted" className="font-normal">
                    {INBOX_CHANNEL_LABELS[thread.channel]}
                  </Badge>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {thread.lastMessagePreview || "—"}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="flex min-h-[420px] flex-col rounded-md border border-border/70">
            {!selectedThread ? (
              <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
                Select a conversation
              </div>
            ) : (
              <>
                <div className="border-b border-border/70 px-4 py-3">
                  <p className="font-medium">
                    {selectedThread.participantName || selectedThread.participantHandle}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {INBOX_CHANNEL_LABELS[selectedThread.channel]} · {selectedThread.participantHandle}
                    {selectedThread.aiSummary ? ` · ${selectedThread.aiSummary}` : ""}
                  </p>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`max-w-[85%] rounded-md px-3 py-2 text-sm ${
                        message.direction === "inbound"
                          ? "bg-muted text-foreground"
                          : "ml-auto bg-primary text-primary-foreground"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.body}</p>
                      <p
                        className={`mt-1 text-[10px] ${
                          message.direction === "inbound"
                            ? "text-muted-foreground"
                            : "text-primary-foreground/70"
                        }`}
                      >
                        {message.direction === "inbound" ? "Customer" : message.senderKind}
                        {message.aiIntent ? ` · ${message.aiIntent}` : ""}
                        {message.occurredAt
                          ? ` · ${new Date(message.occurredAt).toLocaleString()}`
                          : ""}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2 border-t border-border/70 p-3">
                  <Textarea
                    rows={3}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Write a reply (or generate with AI)…"
                    disabled={!canManage}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending || !canManage}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await draftInboxReplyAction(
                            workspace.slug,
                            selectedThread.id
                          )
                          if (result.ok) {
                            setReply(result.data.draftReply)
                            toast.success(
                              `Draft ready · ${result.data.intent} (${Math.round(result.data.confidence * 100)}%)`
                            )
                            openThread(selectedThread.id)
                          } else toast.error(result.error)
                        })
                      }
                    >
                      {pending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="size-3.5" />
                      )}
                      AI draft
                    </Button>
                    <Button
                      size="sm"
                      disabled={pending || !canPublish || !reply.trim() || whatsappAccounts.length === 0}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await sendInboxReplyAction(workspace.slug, {
                            threadId: selectedThread.id,
                            body: reply,
                            connectedAccountId:
                              selectedThread.connectedAccountId || whatsappAccounts[0]?.id,
                          })
                          if (result.ok) {
                            setMessages((list) => [...list, result.data.message])
                            setReply("")
                            toast.success("Reply sent")
                            const refreshed = await listInboxThreadsAction(workspace.slug)
                            if (refreshed.ok) setThreads(refreshed.data)
                          } else toast.error(result.error)
                        })
                      }
                    >
                      {pending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Send className="size-3.5" />
                      )}
                      Send reply
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Session replies work inside WhatsApp’s 24h window. Marketing outside that window still
                    needs approved templates. Auto-FAQ replies (if enabled in Settings) only fire on
                    high-confidence FAQ intents.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
