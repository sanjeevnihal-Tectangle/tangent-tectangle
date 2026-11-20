"use client"

import {
  Check,
  Loader2,
  CalendarClock,
  Inbox,
  MessageSquareText,
  Package,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react"
import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { PageHeader } from "@/components/page/page-header"
import { ConnectionRequired, EmptyState, NotConfigured } from "@/components/states/states"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  acceptImportBatchAction,
  deleteAudienceAction,
  deleteBroadcastAction,
  deleteContactAction,
  deleteProductAction,
  deleteTemplateAction,
  executeBroadcastAction,
  importContactsCsvAction,
  optOutContactAction,
  rejectImportBatchAction,
  saveAudienceAction,
  saveBroadcastAction,
  saveContactAction,
  saveProductAction,
  markTemplateReadyAction,
  saveTemplateAction,
  submitBroadcastForApprovalAction,
  submitTemplateToMetaAction,
  syncWhatsappTemplatesAction,
  testSendTemplateAction,
} from "@/features/messaging/actions"
import { MessagingInboxPanel } from "@/features/messaging/messaging-inbox-panel"
import {
  MessagingAutomationsPanel,
  MessagingSettingsPanel,
} from "@/features/messaging/messaging-m3-panels"
import type { ConnectedAccountView } from "@/lib/domain/social"
import {
  BROADCAST_STATUS_LABELS,
  CHANNEL_PROVIDER,
  CONSENT_STATE_LABELS,
  CONTACT_SOURCE_LABELS,
  emptyAudience,
  emptyBroadcast,
  emptyContact,
  emptyProduct,
  emptyTemplate,
  MESSAGE_CHANNEL_LABELS,
  MESSAGE_CHANNELS,
  PRODUCT_STATUS_LABELS,
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_LABELS,
  TEMPLATE_STATUS_LABELS,
  type Audience,
  type BroadcastStatus,
  type Contact,
  type ContactImportBatch,
  type MessageAutomation,
  type MessageBroadcast,
  type MessageChannel,
  type MessageTemplate,
  type MessagingSettings,
  type Product,
  type TemplateCategory,
  type TemplateHeaderFormat,
  type TemplateStatus,
} from "@/lib/domain/messaging"
import { normalizePhoneE164 } from "@/lib/messaging/phone"
import { listTemplatePlaceholders } from "@/lib/messaging/variables"
import { workspaceHref } from "@/lib/navigation"

const TEMPLATE_BADGE: Record<TemplateStatus, "muted" | "info" | "warning" | "success" | "destructive"> = {
  draft: "muted",
  pending_meta: "warning",
  approved: "success",
  rejected: "destructive",
  paused: "info",
}

const BROADCAST_BADGE: Record<BroadcastStatus, "muted" | "info" | "warning" | "success" | "destructive" | "brand"> = {
  draft: "muted",
  pending_approval: "warning",
  approved: "success",
  queued: "info",
  sending: "brand",
  completed: "success",
  failed: "destructive",
  cancelled: "muted",
}

export function MessagingWorkspace({
  initialProducts,
  initialContacts,
  initialAudiences,
  initialBatches,
  initialTemplates,
  initialBroadcasts,
  initialAutomations,
  initialSettings,
  whatsappAccounts,
  instagramAccounts = [],
  smsAccounts,
  emailAccounts,
  metaConfigured,
  schemaReady,
}: {
  initialProducts: Product[]
  initialContacts: Contact[]
  initialAudiences: Audience[]
  initialBatches: ContactImportBatch[]
  initialTemplates: MessageTemplate[]
  initialBroadcasts: MessageBroadcast[]
  initialAutomations: MessageAutomation[]
  initialSettings: MessagingSettings
  whatsappAccounts: ConnectedAccountView[]
  instagramAccounts?: ConnectedAccountView[]
  smsAccounts: ConnectedAccountView[]
  emailAccounts: ConnectedAccountView[]
  metaConfigured: boolean
  schemaReady: boolean
}) {
  const { workspace } = useWorkspace()
  const canManage = useCan("campaigns.manage")
  const canPublish = useCan("content.publish")
  const [products, setProducts] = useState(initialProducts)
  const [contacts, setContacts] = useState(initialContacts)
  const [audiences, setAudiences] = useState(initialAudiences)
  const [batches, setBatches] = useState(initialBatches)
  const [templates, setTemplates] = useState(initialTemplates)
  const [broadcasts, setBroadcasts] = useState(initialBroadcasts)
  const [automations, setAutomations] = useState(initialAutomations)
  const [settings, setSettings] = useState(initialSettings)
  const [pending, startTransition] = useTransition()

  const [productDialog, setProductDialog] = useState<Product | null>(null)
  const [audienceDialog, setAudienceDialog] = useState<Audience | null>(null)
  const [contactDialog, setContactDialog] = useState<Contact | null>(null)
  const [contactPhoneRaw, setContactPhoneRaw] = useState("")
  const [templateDialog, setTemplateDialog] = useState<MessageTemplate | null>(null)
  const [broadcastDialog, setBroadcastDialog] = useState<MessageBroadcast | null>(null)
  const [testSendTemplate, setTestSendTemplate] = useState<MessageTemplate | null>(null)
  const [testContactMode, setTestContactMode] = useState<"existing" | "new">("new")
  const [testContactId, setTestContactId] = useState("")
  const [testContactName, setTestContactName] = useState("")
  const [testContactPhone, setTestContactPhone] = useState("")
  const [testVariableValues, setTestVariableValues] = useState<Record<string, string>>({})
  const [testHeaderMediaUrl, setTestHeaderMediaUrl] = useState("")
  const [csvText, setCsvText] = useState("")
  const [csvFilename, setCsvFilename] = useState("contacts.csv")
  const [csvSource, setCsvSource] = useState<"csv" | "scrape">("csv")
  const [selectedWhatsappId, setSelectedWhatsappId] = useState(whatsappAccounts[0]?.id ?? "")
  const [templateChannelFilter, setTemplateChannelFilter] = useState<MessageChannel | "all">("all")
  const messagingAccountsByChannel: Record<MessageChannel, ConnectedAccountView[]> = {
    whatsapp: whatsappAccounts,
    sms: smsAccounts,
    email: emailAccounts,
  }
  const allMessagingAccounts = [...whatsappAccounts, ...smsAccounts, ...emailAccounts]
  const approvedTemplates = templates.filter((t) => t.status === "approved")
  const filteredTemplates =
    templateChannelFilter === "all"
      ? templates
      : templates.filter((t) => t.channel === templateChannelFilter)

  const optedIn = useMemo(
    () =>
      contacts.filter(
        (c) =>
          !c.optedOutAt &&
          (c.consentWhatsapp === "opted_in" ||
            c.consentSms === "opted_in" ||
            c.consentEmail === "opted_in")
      ).length,
    [contacts]
  )
  const approvedTemplateCount = approvedTemplates.length
  const pendingBatches = batches.filter((b) => b.status === "pending_review")

  function accountsForChannel(channel: MessageChannel): ConnectedAccountView[] {
    return messagingAccountsByChannel[channel]
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messaging"
        description="Open Inbox for live conversations and AI drafts. Settings controls auto-reply. Templates/Broadcasts are for outbound marketing."
        meta={<Badge variant="muted">Phase 4.5 · M0–M5 inbox</Badge>}
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={workspaceHref(workspace.slug, "integrations")}>Integrations</Link>
              </Button>
            </div>
          ) : null
        }
      />

      {!schemaReady ? (
        <NotConfigured
          title="Messaging database tables are missing"
          description="Run messaging migrations (including 20261120000100_messaging_inbox.sql) in the Supabase SQL Editor, then refresh."
          envVars={[
            "20261119000100_messaging.sql",
            "20261119000200_messaging_broadcasts.sql",
            "20261119000300_messaging_automations.sql",
            "20261120000100_messaging_inbox.sql",
          ]}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Products</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{products.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Contacts</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {contacts.length}
            <span className="ml-2 text-sm font-normal text-muted-foreground">{optedIn} opted in</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Templates</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {templates.length}
            <span className="ml-2 text-sm font-normal text-muted-foreground">{approvedTemplateCount} approved</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Broadcasts</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{broadcasts.length}</CardContent>
        </Card>
      </div>

      {!metaConfigured ? (
        <NotConfigured
          title="Meta credentials required for WhatsApp"
          description="Add META_APP_ID and META_APP_SECRET to enable OAuth and template sync. SMS (MSG91) and email (Resend) use Direct Connect under Integrations."
          envVars={["META_APP_ID", "META_APP_SECRET"]}
        />
      ) : null}
      {allMessagingAccounts.length === 0 ? (
        <ConnectionRequired
          provider="Messaging channels"
          description="Connect WhatsApp, MSG91 SMS, and/or Resend email under Integrations before broadcasting."
          href={workspaceHref(workspace.slug, "integrations")}
        />
      ) : null}

      <Tabs defaultValue="inbox">
        <TabsList>
          <TabsTrigger value="inbox">
            <Inbox className="size-3.5" /> Inbox
          </TabsTrigger>
          <TabsTrigger value="products">
            <Package className="size-3.5" /> Products
          </TabsTrigger>
          <TabsTrigger value="audiences">
            <Users className="size-3.5" /> Audiences
          </TabsTrigger>
          <TabsTrigger value="templates">
            <MessageSquareText className="size-3.5" /> Templates
          </TabsTrigger>
          <TabsTrigger value="broadcasts">
            <Send className="size-3.5" /> Broadcasts
          </TabsTrigger>
          <TabsTrigger value="automations">
            <CalendarClock className="size-3.5" /> Automations
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings2 className="size-3.5" /> Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Scope audiences and templates per product. Seeded from business profile when empty.
            </p>
            {canManage ? (
              <Button size="sm" onClick={() => setProductDialog(emptyProduct(crypto.randomUUID()))}>
                <Plus className="size-3.5" /> Add product
              </Button>
            ) : null}
          </div>
          {products.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No products yet"
              description="Add the products or services you market. Business onboarding names are imported automatically when available."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {products.map((product) => (
                <Card key={product.id}>
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div>
                      <CardTitle className="text-base">{product.name}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {product.description || "No description"}
                      </p>
                    </div>
                    <Badge variant="muted">{PRODUCT_STATUS_LABELS[product.status]}</Badge>
                  </CardHeader>
                  <CardContent className="flex gap-2">
                    {canManage ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setProductDialog(product)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              if (!window.confirm(`Archive/delete "${product.name}"?`)) return
                              const result = await deleteProductAction(workspace.slug, product.id)
                              if (result.ok) {
                                setProducts((list) => list.filter((p) => p.id !== product.id))
                                toast.success("Product removed")
                              } else toast.error(result.error)
                            })
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="audiences" className="space-y-6">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Contacts</h3>
                <p className="text-sm text-muted-foreground">
                  Add one contact for test sends, or import a CSV.
                </p>
              </div>
              {canManage ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setContactDialog(emptyContact(crypto.randomUUID()))
                    setContactPhoneRaw("")
                  }}
                >
                  <Plus className="size-3.5" /> Add contact
                </Button>
              ) : null}
            </div>
            {contacts.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No contacts yet"
                description="Add a single contact to test templates, or import a CSV below."
              />
            ) : (
              <div className="space-y-2">
                {contacts.slice(0, 40).map((contact) => (
                  <Card key={contact.id}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{contact.name || "Unnamed"}</p>
                        <p className="text-xs text-muted-foreground">
                          {contact.phoneE164 ?? "No phone"}
                          {contact.email ? ` · ${contact.email}` : ""}
                          {" · "}
                          WA {CONSENT_STATE_LABELS[contact.consentWhatsapp]}
                        </p>
                      </div>
                      {canManage ? (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setContactDialog(contact)
                              setContactPhoneRaw(contact.phoneE164 ?? "")
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() =>
                              startTransition(async () => {
                                const result = await deleteContactAction(workspace.slug, contact.id)
                                if (result.ok) {
                                  setContacts((list) => list.filter((c) => c.id !== contact.id))
                                  toast.success("Contact deleted")
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
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Import contacts</h3>
            </div>
            <Card>
              <CardContent className="space-y-3 pt-5">
                <p className="text-sm text-muted-foreground">
                  CSV columns:{" "}
                  <code className="text-xs">
                    name, phone, email, consent_whatsapp, consent_sms, consent_email
                  </code>
                  . Scraped leads import as review batches — marketing sends only go to opted-in contacts.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="csv-filename">Filename</Label>
                    <Input
                      id="csv-filename"
                      value={csvFilename}
                      onChange={(e) => setCsvFilename(e.target.value)}
                      disabled={!canManage}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Source</Label>
                    <Select
                      value={csvSource}
                      onValueChange={(v) => setCsvSource(v as "csv" | "scrape")}
                      disabled={!canManage}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="csv">CSV / system export</SelectItem>
                        <SelectItem value="scrape">Scraped / lead gen</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder={"name,phone,consent_whatsapp\nAsha,+919876543210,yes"}
                  rows={5}
                  disabled={!canManage}
                />
                <Button
                  size="sm"
                  disabled={!canManage || pending || !csvText.trim()}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await importContactsCsvAction(workspace.slug, {
                        csvText,
                        filename: csvFilename,
                        source: csvSource,
                      })
                      if (result.ok) {
                        setBatches((list) => [result.data, ...list])
                        setCsvText("")
                        toast.success("Import uploaded for review")
                      } else toast.error(result.error)
                    })
                  }
                >
                  {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                  Upload for review
                </Button>
              </CardContent>
            </Card>

            {pendingBatches.length > 0 ? (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Pending review ({pendingBatches.length})</h4>
                {pendingBatches.map((batch) => (
                  <Card key={batch.id}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
                      <div>
                        <p className="text-sm font-medium">
                          {batch.filename || "Untitled"} · {CONTACT_SOURCE_LABELS[batch.source]}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {batch.acceptedCount} valid · {batch.rejectedCount} rejected rows
                        </p>
                      </div>
                      {canManage ? (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              startTransition(async () => {
                                const result = await acceptImportBatchAction(workspace.slug, batch.id)
                                if (result.ok) {
                                  setBatches((list) =>
                                    list.map((b) => (b.id === batch.id ? result.data.batch : b))
                                  )
                                  setContacts((list) => [...result.data.contacts, ...list])
                                  toast.success(`Added ${result.data.contacts.length} contacts`)
                                } else toast.error(result.error)
                              })
                            }
                          >
                            <Check className="size-3.5" /> Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() =>
                              startTransition(async () => {
                                const result = await rejectImportBatchAction(workspace.slug, batch.id)
                                if (result.ok) {
                                  setBatches((list) =>
                                    list.map((b) => (b.id === batch.id ? result.data : b))
                                  )
                                  toast.message("Import rejected")
                                } else toast.error(result.error)
                              })
                            }
                          >
                            <X className="size-3.5" /> Reject
                          </Button>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Contacts ({contacts.length})</h3>
            </div>
            {contacts.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No contacts yet"
                description="Import a CSV or scraped lead file, then accept the review batch."
              />
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Phone</th>
                      <th className="px-3 py-2 font-medium">Consent</th>
                      <th className="px-3 py-2 font-medium">Source</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.slice(0, 50).map((contact) => (
                      <tr key={contact.id} className="border-t">
                        <td className="px-3 py-2">{contact.name || "—"}</td>
                        <td className="px-3 py-2 font-mono text-xs">{contact.phoneE164 || "—"}</td>
                        <td className="px-3 py-2">
                          <Badge variant="muted">{CONSENT_STATE_LABELS[contact.consentWhatsapp]}</Badge>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {CONTACT_SOURCE_LABELS[contact.source]}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {canManage ? (
                            <div className="flex justify-end gap-1">
                              {contact.consentWhatsapp !== "opted_out" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={pending}
                                  onClick={() =>
                                    startTransition(async () => {
                                      const result = await optOutContactAction(
                                        workspace.slug,
                                        contact.id
                                      )
                                      if (result.ok) {
                                        setContacts((list) =>
                                          list.map((c) => (c.id === contact.id ? result.data : c))
                                        )
                                        toast.success("Contact opted out")
                                      } else toast.error(result.error)
                                    })
                                  }
                                >
                                  Opt out
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={pending}
                                onClick={() =>
                                  startTransition(async () => {
                                    const result = await deleteContactAction(
                                      workspace.slug,
                                      contact.id
                                    )
                                    if (result.ok) {
                                      setContacts((list) => list.filter((c) => c.id !== contact.id))
                                    } else toast.error(result.error)
                                  })
                                }
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Audiences</h3>
              {canManage ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setAudienceDialog({
                      ...emptyAudience(crypto.randomUUID()),
                      memberIds: contacts.map((c) => c.id),
                      estimatedSize: contacts.length,
                    })
                  }
                >
                  <Plus className="size-3.5" /> New audience
                </Button>
              ) : null}
            </div>
            {audiences.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No audiences"
                description="Group contacts for broadcasts. Start with all imported contacts, then refine."
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {audiences.map((audience) => (
                  <Card key={audience.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{audience.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {audience.estimatedSize} members
                        {audience.productId
                          ? ` · ${products.find((p) => p.id === audience.productId)?.name ?? "Product"}`
                          : ""}
                      </p>
                    </CardHeader>
                    <CardContent className="flex gap-2">
                      {canManage ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setAudienceDialog(audience)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() =>
                              startTransition(async () => {
                                const result = await deleteAudienceAction(workspace.slug, audience.id)
                                if (result.ok) {
                                  setAudiences((list) => list.filter((a) => a.id !== audience.id))
                                  toast.success("Audience deleted")
                                } else toast.error(result.error)
                              })
                            }
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="inbox" className="space-y-4">
          <MessagingInboxPanel
            whatsappAccounts={whatsappAccounts}
            instagramAccounts={instagramAccounts}
          />
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap gap-3">
              <div className="space-y-1.5">
                <Label>Channel</Label>
                <Select
                  value={templateChannelFilter}
                  onValueChange={(v) => setTemplateChannelFilter(v as MessageChannel | "all")}
                >
                  <SelectTrigger className="min-w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All channels</SelectItem>
                    {MESSAGE_CHANNELS.map((ch) => (
                      <SelectItem key={ch} value={ch}>
                        {MESSAGE_CHANNEL_LABELS[ch]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>WhatsApp number (Meta sync)</Label>
                <Select
                  value={selectedWhatsappId || undefined}
                  onValueChange={setSelectedWhatsappId}
                  disabled={whatsappAccounts.length === 0}
                >
                  <SelectTrigger className="min-w-[240px]">
                    <SelectValue placeholder="Connect WhatsApp first" />
                  </SelectTrigger>
                  <SelectContent>
                    {whatsappAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              {canManage ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!selectedWhatsappId || pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await syncWhatsappTemplatesAction(
                          workspace.slug,
                          selectedWhatsappId
                        )
                        if (result.ok) {
                          setTemplates((list) => {
                            const ids = new Set(result.data.templates.map((t) => t.id))
                            return [
                              ...result.data.templates,
                              ...list.filter((t) => !ids.has(t.id)),
                            ]
                          })
                          toast.success(`Synced ${result.data.synced} templates from Meta`)
                        } else toast.error(result.error)
                      })
                    }
                  >
                    {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    Sync WhatsApp
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      const channel: MessageChannel =
                        templateChannelFilter === "all" ? "whatsapp" : templateChannelFilter
                      const accounts = accountsForChannel(channel)
                      setTemplateDialog({
                        ...emptyTemplate(crypto.randomUUID()),
                        channel,
                        connectedAccountId: accounts[0]?.id ?? selectedWhatsappId ?? null,
                      })
                    }}
                  >
                    <Plus className="size-3.5" /> Draft template
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          {filteredTemplates.length === 0 ? (
            <EmptyState
              icon={MessageSquareText}
              title="No templates yet"
              description="Draft WhatsApp (submit to Meta), SMS (DLT Flow id + mark ready), or email (subject + mark ready) templates."
            />
          ) : (
            <div className="space-y-2">
              {filteredTemplates.map((template) => (
                <Card key={template.id}>
                  <CardContent className="flex flex-wrap items-start justify-between gap-3 pt-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-sm font-medium">{template.name}</p>
                        <Badge variant="muted">{MESSAGE_CHANNEL_LABELS[template.channel]}</Badge>
                        <Badge variant={TEMPLATE_BADGE[template.status]}>
                          {TEMPLATE_STATUS_LABELS[template.status]}
                        </Badge>
                        <Badge variant="muted">{TEMPLATE_CATEGORY_LABELS[template.category]}</Badge>
                        <span className="text-xs text-muted-foreground">{template.language}</span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {template.bodyComponents.emailSubject
                          ? `${template.bodyComponents.emailSubject} — `
                          : ""}
                        {template.bodyComponents.headerFormat &&
                        template.bodyComponents.headerFormat !== "TEXT"
                          ? `[${template.bodyComponents.headerFormat} header] `
                          : template.bodyComponents.headerText
                            ? `${template.bodyComponents.headerText} · `
                            : ""}
                        {template.bodyComponents.bodyText}
                      </p>
                      {(template.bodyComponents.buttons?.length ?? 0) > 0 ? (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {template.bodyComponents.buttons!.map((btn, idx) => (
                            <Badge key={`${btn.type}-${idx}`} variant="outline" className="font-normal">
                              {btn.type === "URL"
                                ? `Link · ${btn.text}`
                                : btn.type === "PHONE_NUMBER"
                                  ? `Call · ${btn.text}`
                                  : `Reply · ${btn.text}`}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                      {template.rejectionReason &&
                      template.rejectionReason.toUpperCase() !== "NONE" ? (
                        <p className="text-xs text-destructive">{template.rejectionReason}</p>
                      ) : null}
                    </div>
                    {canManage ? (
                      <div className="flex flex-wrap gap-2">
                        {template.status === "approved" ? (
                          <Button
                            size="sm"
                            disabled={!canPublish}
                            onClick={() => {
                              const placeholders = listTemplatePlaceholders(
                                template.bodyComponents.bodyText
                              )
                              const defaults: Record<string, string> = {}
                              placeholders.forEach((ph, i) => {
                                defaults[ph] =
                                  template.bodyComponents.variableExamples[i] ??
                                  (ph === "name" || ph === "1" ? "Test" : "")
                              })
                              setTestVariableValues(defaults)
                              setTestContactMode(contacts.length > 0 ? "existing" : "new")
                              setTestContactId(contacts[0]?.id ?? "")
                              setTestContactName("")
                              setTestContactPhone("")
                              setTestHeaderMediaUrl(template.bodyComponents.headerMediaUrl ?? "")
                              setTestSendTemplate(template)
                            }}
                          >
                            <Send className="size-3.5" /> Test send
                          </Button>
                        ) : null}
                        <Button size="sm" variant="outline" onClick={() => setTemplateDialog(template)}>
                          Edit
                        </Button>
                        {template.channel === "whatsapp" &&
                        (template.status === "draft" || template.status === "rejected") ? (
                          <Button
                            size="sm"
                            disabled={!selectedWhatsappId || pending}
                            onClick={() =>
                              startTransition(async () => {
                                const result = await submitTemplateToMetaAction(
                                  workspace.slug,
                                  template.id,
                                  selectedWhatsappId
                                )
                                if (result.ok) {
                                  setTemplates((list) =>
                                    list.map((t) => (t.id === template.id ? result.data : t))
                                  )
                                  toast.success("Submitted to Meta for review")
                                } else toast.error(result.error)
                              })
                            }
                          >
                            Submit to Meta
                          </Button>
                        ) : null}
                        {template.channel !== "whatsapp" &&
                        (template.status === "draft" ||
                          template.status === "rejected" ||
                          template.status === "paused") ? (
                          <Button
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              startTransition(async () => {
                                const result = await markTemplateReadyAction(
                                  workspace.slug,
                                  template.id
                                )
                                if (result.ok) {
                                  setTemplates((list) =>
                                    list.map((t) => (t.id === template.id ? result.data : t))
                                  )
                                  toast.success("Template marked ready")
                                } else toast.error(result.error)
                              })
                            }
                          >
                            <Check className="size-3.5" /> Mark ready
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const result = await deleteTemplateAction(workspace.slug, template.id)
                              if (result.ok) {
                                setTemplates((list) => list.filter((t) => t.id !== template.id))
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
        </TabsContent>

        <TabsContent value="broadcasts" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Compose → submit for approval → execute. Marketing templates only go to opted-in contacts.
            </p>
            {canManage ? (
              <Button
                size="sm"
                disabled={!schemaReady}
                onClick={() => {
                  const tpl = approvedTemplates[0]
                  const channel = tpl?.channel ?? "whatsapp"
                  const accounts = accountsForChannel(channel)
                  setBroadcastDialog({
                    ...emptyBroadcast(crypto.randomUUID()),
                    channel,
                    connectedAccountId: accounts[0]?.id ?? "",
                    templateId: tpl?.id ?? "",
                    audienceId: audiences[0]?.id ?? "",
                    variableMapping: { "1": "name" },
                  })
                }}
              >
                <Plus className="size-3.5" /> New broadcast
              </Button>
            ) : null}
          </div>

          {broadcasts.length === 0 ? (
            <EmptyState
              icon={Send}
              title="No broadcasts yet"
              description="Pick an approved Meta template and an audience, then submit for human approval before send."
            />
          ) : (
            <div className="space-y-2">
              {broadcasts.map((broadcast) => (
                <Card key={broadcast.id}>
                  <CardContent className="flex flex-wrap items-start justify-between gap-3 pt-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{broadcast.name}</p>
                        <Badge variant="muted">{MESSAGE_CHANNEL_LABELS[broadcast.channel]}</Badge>
                        <Badge variant={BROADCAST_BADGE[broadcast.status]}>
                          {BROADCAST_STATUS_LABELS[broadcast.status]}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {broadcast.contactSnapshotIds.length || "—"} recipients · sent{" "}
                        {broadcast.stats.sent} · failed {broadcast.stats.failed} · skipped{" "}
                        {broadcast.stats.skipped}
                      </p>
                      {broadcast.lastError ? (
                        <p className="text-xs text-destructive">{broadcast.lastError}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canManage && (broadcast.status === "draft" || broadcast.status === "failed") ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setBroadcastDialog(broadcast)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              startTransition(async () => {
                                const result = await submitBroadcastForApprovalAction(
                                  workspace.slug,
                                  broadcast.id
                                )
                                if (result.ok) {
                                  setBroadcasts((list) =>
                                    list.map((b) => (b.id === broadcast.id ? result.data : b))
                                  )
                                  toast.success("Submitted for approval")
                                } else toast.error(result.error)
                              })
                            }
                          >
                            Submit for approval
                          </Button>
                        </>
                      ) : null}
                      {broadcast.status === "pending_approval" || broadcast.status === "approved" ? (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" asChild>
                            <Link href={workspaceHref(workspace.slug, "command-centre")}>
                              Open approvals
                            </Link>
                          </Button>
                          {canPublish ? (
                            <Button
                              size="sm"
                              disabled={pending}
                              onClick={() =>
                                startTransition(async () => {
                                  const result = await executeBroadcastAction(
                                    workspace.slug,
                                    broadcast.id
                                  )
                                  if (result.ok) {
                                    setBroadcasts((list) =>
                                      list.map((b) => (b.id === broadcast.id ? result.data : b))
                                    )
                                    toast.success(
                                      `Sent ${result.data.stats.sent} · failed ${result.data.stats.failed}`
                                    )
                                  } else toast.error(result.error)
                                })
                              }
                            >
                              {pending ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Send className="size-3.5" />
                              )}
                              Execute send
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                      {canManage ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const result = await deleteBroadcastAction(workspace.slug, broadcast.id)
                              if (result.ok) {
                                setBroadcasts((list) => list.filter((b) => b.id !== broadcast.id))
                              } else toast.error(result.error)
                            })
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="automations" className="space-y-4">
          <MessagingAutomationsPanel
            automations={automations}
            setAutomations={setAutomations}
            templates={templates}
            audiences={audiences}
            messagingAccounts={allMessagingAccounts}
            schemaReady={schemaReady}
          />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <MessagingSettingsPanel
            settings={settings}
            setSettings={setSettings}
            whatsappAccounts={whatsappAccounts}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(productDialog)} onOpenChange={(open) => !open && setProductDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{productDialog?.name ? "Edit product" : "New product"}</DialogTitle>
            <DialogDescription>Products scope messaging audiences and templates.</DialogDescription>
          </DialogHeader>
          {productDialog ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="product-name">Name</Label>
                <Input
                  id="product-name"
                  value={productDialog.name}
                  onChange={(e) => setProductDialog({ ...productDialog, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="product-desc">Description</Label>
                <Textarea
                  id="product-desc"
                  value={productDialog.description}
                  onChange={(e) => setProductDialog({ ...productDialog, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="product-sku">SKU</Label>
                  <Input
                    id="product-sku"
                    value={productDialog.sku ?? ""}
                    onChange={(e) =>
                      setProductDialog({ ...productDialog, sku: e.target.value || null })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="product-cat">Category</Label>
                  <Input
                    id="product-cat"
                    value={productDialog.category ?? ""}
                    onChange={(e) =>
                      setProductDialog({ ...productDialog, category: e.target.value || null })
                    }
                  />
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductDialog(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !productDialog}
              onClick={() =>
                startTransition(async () => {
                  if (!productDialog) return
                  const result = await saveProductAction(workspace.slug, productDialog)
                  if (result.ok) {
                    setProducts((list) => [result.data, ...list.filter((p) => p.id !== result.data.id)])
                    setProductDialog(null)
                    toast.success("Product saved")
                  } else toast.error(result.error)
                })
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(audienceDialog)} onOpenChange={(open) => !open && setAudienceDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Audience</DialogTitle>
            <DialogDescription>
              Members are selected from current contacts ({contacts.length} available).
            </DialogDescription>
          </DialogHeader>
          {audienceDialog ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="aud-name">Name</Label>
                <Input
                  id="aud-name"
                  value={audienceDialog.name}
                  onChange={(e) => setAudienceDialog({ ...audienceDialog, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aud-desc">Description</Label>
                <Textarea
                  id="aud-desc"
                  value={audienceDialog.description}
                  onChange={(e) =>
                    setAudienceDialog({ ...audienceDialog, description: e.target.value })
                  }
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Product (optional)</Label>
                <Select
                  value={audienceDialog.productId ?? "none"}
                  onValueChange={(v) =>
                    setAudienceDialog({
                      ...audienceDialog,
                      productId: v === "none" ? null : v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">All products</SelectItem>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Saving uses all current contacts as members ({contacts.length}). Refine membership in M2.
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAudienceDialog(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !audienceDialog}
              onClick={() =>
                startTransition(async () => {
                  if (!audienceDialog) return
                  const payload = {
                    ...audienceDialog,
                    memberIds: contacts.map((c) => c.id),
                    estimatedSize: contacts.length,
                  }
                  const result = await saveAudienceAction(workspace.slug, payload)
                  if (result.ok) {
                    setAudiences((list) => [result.data, ...list.filter((a) => a.id !== result.data.id)])
                    setAudienceDialog(null)
                    toast.success("Audience saved")
                  } else toast.error(result.error)
                })
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(templateDialog)} onOpenChange={(open) => !open && setTemplateDialog(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {templateDialog
                ? `${MESSAGE_CHANNEL_LABELS[templateDialog.channel]} template`
                : "Template"}
            </DialogTitle>
            <DialogDescription>
              Name must be lowercase with underscores. Use {"{{1}}"} or named {"{{account}}"} variables.
              WhatsApp supports text/media headers and up to 3 buttons (quick reply, link, call); Meta must
              approve before send. SMS/email use Mark ready after DLT/subject fields.
            </DialogDescription>
          </DialogHeader>
          {templateDialog ? (
            <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Channel</Label>
                  <Select
                    value={templateDialog.channel}
                    onValueChange={(v) => {
                      const channel = v as MessageChannel
                      const accounts = accountsForChannel(channel)
                      setTemplateDialog({
                        ...templateDialog,
                        channel,
                        connectedAccountId: accounts[0]?.id ?? null,
                      })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MESSAGE_CHANNELS.map((ch) => (
                        <SelectItem key={ch} value={ch}>
                          {MESSAGE_CHANNEL_LABELS[ch]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select
                    value={templateDialog.category}
                    onValueChange={(v) =>
                      setTemplateDialog({ ...templateDialog, category: v as TemplateCategory })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEMPLATE_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {TEMPLATE_CATEGORY_LABELS[cat]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-name">Name</Label>
                  <Input
                    id="tpl-name"
                    value={templateDialog.name}
                    onChange={(e) =>
                      setTemplateDialog({ ...templateDialog, name: e.target.value.toLowerCase() })
                    }
                    placeholder="festive_offer_v1"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-lang">Language</Label>
                  <Input
                    id="tpl-lang"
                    value={templateDialog.language}
                    onChange={(e) =>
                      setTemplateDialog({ ...templateDialog, language: e.target.value })
                    }
                  />
                </div>
              </div>
              {templateDialog.channel === "email" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-subject">Subject</Label>
                  <Input
                    id="tpl-subject"
                    value={templateDialog.bodyComponents.emailSubject ?? ""}
                    onChange={(e) =>
                      setTemplateDialog({
                        ...templateDialog,
                        bodyComponents: {
                          ...templateDialog.bodyComponents,
                          emailSubject: e.target.value || undefined,
                        },
                      })
                    }
                    placeholder="Diwali offer for {{1}}"
                  />
                </div>
              ) : templateDialog.channel === "whatsapp" ? (
                <div className="space-y-3 rounded-md border border-border/60 p-3">
                  <div className="space-y-1.5">
                    <Label>Header</Label>
                    <Select
                      value={templateDialog.bodyComponents.headerFormat ?? "NONE"}
                      onValueChange={(v) => {
                        if (v === "NONE") {
                          setTemplateDialog({
                            ...templateDialog,
                            bodyComponents: {
                              ...templateDialog.bodyComponents,
                              headerFormat: undefined,
                              headerText: undefined,
                              headerMediaUrl: undefined,
                            },
                          })
                          return
                        }
                        const format = v as TemplateHeaderFormat
                        setTemplateDialog({
                          ...templateDialog,
                          bodyComponents: {
                            ...templateDialog.bodyComponents,
                            headerFormat: format,
                            ...(format === "TEXT"
                              ? { headerMediaUrl: undefined }
                              : { headerText: undefined }),
                          },
                        })
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="No header" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">No header</SelectItem>
                        <SelectItem value="TEXT">Text</SelectItem>
                        <SelectItem value="IMAGE">Image</SelectItem>
                        <SelectItem value="VIDEO">Video</SelectItem>
                        <SelectItem value="DOCUMENT">Document</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {templateDialog.bodyComponents.headerFormat === "TEXT" ||
                  (!templateDialog.bodyComponents.headerFormat &&
                    templateDialog.bodyComponents.headerText) ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="tpl-header">Header text</Label>
                      <Input
                        id="tpl-header"
                        value={templateDialog.bodyComponents.headerText ?? ""}
                        onChange={(e) =>
                          setTemplateDialog({
                            ...templateDialog,
                            bodyComponents: {
                              ...templateDialog.bodyComponents,
                              headerFormat: "TEXT",
                              headerText: e.target.value || undefined,
                            },
                          })
                        }
                        placeholder="Limited-time offer"
                        maxLength={60}
                      />
                    </div>
                  ) : null}
                  {templateDialog.bodyComponents.headerFormat === "IMAGE" ||
                  templateDialog.bodyComponents.headerFormat === "VIDEO" ||
                  templateDialog.bodyComponents.headerFormat === "DOCUMENT" ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="tpl-header-media">
                        Sample {templateDialog.bodyComponents.headerFormat.toLowerCase()} URL
                      </Label>
                      <Input
                        id="tpl-header-media"
                        value={templateDialog.bodyComponents.headerMediaUrl ?? ""}
                        onChange={(e) =>
                          setTemplateDialog({
                            ...templateDialog,
                            bodyComponents: {
                              ...templateDialog.bodyComponents,
                              headerMediaUrl: e.target.value.trim() || undefined,
                            },
                          })
                        }
                        placeholder="https://…/sample.jpg"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Public HTTPS file Meta uses for review (and as the default when you test-send).
                        JPEG/PNG for images, MP4 for video, PDF for documents.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-header">Header (optional)</Label>
                  <Input
                    id="tpl-header"
                    value={templateDialog.bodyComponents.headerText ?? ""}
                    onChange={(e) =>
                      setTemplateDialog({
                        ...templateDialog,
                        bodyComponents: {
                          ...templateDialog.bodyComponents,
                          headerText: e.target.value || undefined,
                        },
                      })
                    }
                  />
                </div>
              )}
              {templateDialog.channel === "sms" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="tpl-dlt">DLT / Flow template id</Label>
                    <Input
                      id="tpl-dlt"
                      value={templateDialog.bodyComponents.dltTemplateId ?? ""}
                      onChange={(e) =>
                        setTemplateDialog({
                          ...templateDialog,
                          bodyComponents: {
                            ...templateDialog.bodyComponents,
                            dltTemplateId: e.target.value || undefined,
                          },
                        })
                      }
                      placeholder="MSG91 Flow id"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tpl-sender">Sender id (optional)</Label>
                    <Input
                      id="tpl-sender"
                      value={templateDialog.bodyComponents.senderId ?? ""}
                      onChange={(e) =>
                        setTemplateDialog({
                          ...templateDialog,
                          bodyComponents: {
                            ...templateDialog.bodyComponents,
                            senderId: e.target.value || undefined,
                          },
                        })
                      }
                      placeholder="TANGNT"
                    />
                  </div>
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="tpl-body">Body</Label>
                <Textarea
                  id="tpl-body"
                  rows={4}
                  value={templateDialog.bodyComponents.bodyText}
                  onChange={(e) =>
                    setTemplateDialog({
                      ...templateDialog,
                      bodyComponents: {
                        ...templateDialog.bodyComponents,
                        bodyText: e.target.value,
                      },
                    })
                  }
                  placeholder="Hi {{1}}, our {{2}} offer is live this weekend."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-examples">Variable examples (comma-separated)</Label>
                <Input
                  id="tpl-examples"
                  value={templateDialog.bodyComponents.variableExamples.join(", ")}
                  onChange={(e) =>
                    setTemplateDialog({
                      ...templateDialog,
                      bodyComponents: {
                        ...templateDialog.bodyComponents,
                        variableExamples: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      },
                    })
                  }
                  placeholder="Asha, Diwali"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-footer">Footer (optional)</Label>
                <Input
                  id="tpl-footer"
                  value={templateDialog.bodyComponents.footerText ?? ""}
                  onChange={(e) =>
                    setTemplateDialog({
                      ...templateDialog,
                      bodyComponents: {
                        ...templateDialog.bodyComponents,
                        footerText: e.target.value || undefined,
                      },
                    })
                  }
                />
              </div>
              {templateDialog.channel === "whatsapp" ? (
                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <Label>Buttons</Label>
                      <p className="text-[11px] text-muted-foreground">
                        Up to 3 · Quick reply, visit website, or call phone
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={(templateDialog.bodyComponents.buttons?.length ?? 0) >= 3}
                      onClick={() => {
                        const buttons = [...(templateDialog.bodyComponents.buttons ?? [])]
                        buttons.push({ type: "QUICK_REPLY", text: "Yes" })
                        setTemplateDialog({
                          ...templateDialog,
                          bodyComponents: { ...templateDialog.bodyComponents, buttons },
                        })
                      }}
                    >
                      <Plus className="size-3.5" /> Add button
                    </Button>
                  </div>
                  {(templateDialog.bodyComponents.buttons ?? []).map((button, index) => (
                    <div
                      key={`btn-${index}`}
                      className="space-y-2 rounded-md bg-muted/30 p-2.5"
                    >
                      <div className="flex items-start gap-2">
                        <div className="grid flex-1 grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Type</Label>
                            <Select
                              value={button.type}
                              onValueChange={(v) => {
                                const buttons = [...(templateDialog.bodyComponents.buttons ?? [])]
                                const type = v as "QUICK_REPLY" | "URL" | "PHONE_NUMBER"
                                buttons[index] = {
                                  type,
                                  text: buttons[index]?.text || "Button",
                                  url: type === "URL" ? buttons[index]?.url : undefined,
                                  phoneNumber:
                                    type === "PHONE_NUMBER" ? buttons[index]?.phoneNumber : undefined,
                                }
                                setTemplateDialog({
                                  ...templateDialog,
                                  bodyComponents: { ...templateDialog.bodyComponents, buttons },
                                })
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="QUICK_REPLY">Quick reply</SelectItem>
                                <SelectItem value="URL">Visit website</SelectItem>
                                <SelectItem value="PHONE_NUMBER">Call phone</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Label</Label>
                            <Input
                              value={button.text}
                              maxLength={25}
                              onChange={(e) => {
                                const buttons = [...(templateDialog.bodyComponents.buttons ?? [])]
                                buttons[index] = { ...button, text: e.target.value }
                                setTemplateDialog({
                                  ...templateDialog,
                                  bodyComponents: { ...templateDialog.bodyComponents, buttons },
                                })
                              }}
                              placeholder="Book demo"
                            />
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="mt-5 shrink-0"
                          onClick={() => {
                            const buttons = (templateDialog.bodyComponents.buttons ?? []).filter(
                              (_, i) => i !== index
                            )
                            setTemplateDialog({
                              ...templateDialog,
                              bodyComponents: {
                                ...templateDialog.bodyComponents,
                                buttons: buttons.length > 0 ? buttons : [],
                              },
                            })
                          }}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                      {button.type === "URL" ? (
                        <div className="space-y-1">
                          <Label className="text-xs">Website URL</Label>
                          <Input
                            value={button.url ?? ""}
                            onChange={(e) => {
                              const buttons = [...(templateDialog.bodyComponents.buttons ?? [])]
                              buttons[index] = {
                                ...button,
                                url: e.target.value.trim() || undefined,
                              }
                              setTemplateDialog({
                                ...templateDialog,
                                bodyComponents: { ...templateDialog.bodyComponents, buttons },
                              })
                            }}
                            placeholder="https://tectangle.com/demo"
                          />
                        </div>
                      ) : null}
                      {button.type === "PHONE_NUMBER" ? (
                        <div className="space-y-1">
                          <Label className="text-xs">Phone number</Label>
                          <Input
                            value={button.phoneNumber ?? ""}
                            onChange={(e) => {
                              const buttons = [...(templateDialog.bodyComponents.buttons ?? [])]
                              buttons[index] = {
                                ...button,
                                phoneNumber: e.target.value.trim() || undefined,
                              }
                              setTemplateDialog({
                                ...templateDialog,
                                bodyComponents: { ...templateDialog.bodyComponents, buttons },
                              })
                            }}
                            placeholder="+919876543210"
                          />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label>Product (optional)</Label>
                <Select
                  value={templateDialog.productId ?? "none"}
                  onValueChange={(v) =>
                    setTemplateDialog({
                      ...templateDialog,
                      productId: v === "none" ? null : v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialog(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !templateDialog}
              onClick={() =>
                startTransition(async () => {
                  if (!templateDialog) return
                  const buttons = templateDialog.bodyComponents.buttons ?? []
                  for (const button of buttons) {
                    if (!button.text.trim()) {
                      toast.error("Each button needs a label")
                      return
                    }
                    if (button.type === "URL" && !button.url?.trim()) {
                      toast.error(`Add a website URL for “${button.text}”`)
                      return
                    }
                    if (button.type === "PHONE_NUMBER" && !button.phoneNumber?.trim()) {
                      toast.error(`Add a phone number for “${button.text}”`)
                      return
                    }
                  }
                  const headerFormat = templateDialog.bodyComponents.headerFormat
                  if (
                    (headerFormat === "IMAGE" ||
                      headerFormat === "VIDEO" ||
                      headerFormat === "DOCUMENT") &&
                    !templateDialog.bodyComponents.headerMediaUrl?.trim()
                  ) {
                    toast.error(`Add a public HTTPS ${headerFormat.toLowerCase()} URL for the header`)
                    return
                  }
                  if (
                    headerFormat === "TEXT" &&
                    !templateDialog.bodyComponents.headerText?.trim()
                  ) {
                    toast.error("Add header text or switch header to None")
                    return
                  }
                  const result = await saveTemplateAction(workspace.slug, {
                    ...templateDialog,
                    status: templateDialog.status === "approved" ? "draft" : templateDialog.status,
                    connectedAccountId: templateDialog.connectedAccountId || selectedWhatsappId || null,
                    bodyComponents: {
                      ...templateDialog.bodyComponents,
                      buttons: buttons.length > 0 ? buttons : undefined,
                    },
                  })
                  if (result.ok) {
                    setTemplates((list) => [result.data, ...list.filter((t) => t.id !== result.data.id)])
                    setTemplateDialog(null)
                    toast.success("Template saved as draft")
                  } else toast.error(result.error)
                })
              }
            >
              Save draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(broadcastDialog)} onOpenChange={(open) => !open && setBroadcastDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Broadcast</DialogTitle>
            <DialogDescription>
              Uses ready/approved templates only. Variable {"{{1}}"} can map to name, phone, attr:field, or literal:text.
            </DialogDescription>
          </DialogHeader>
          {broadcastDialog ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="bc-name">Name</Label>
                <Input
                  id="bc-name"
                  value={broadcastDialog.name}
                  onChange={(e) => setBroadcastDialog({ ...broadcastDialog, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Template (approved / ready)</Label>
                <Select
                  value={broadcastDialog.templateId || undefined}
                  onValueChange={(v) => {
                    const tpl = approvedTemplates.find((t) => t.id === v)
                    const channel = tpl?.channel ?? broadcastDialog.channel
                    const accounts = accountsForChannel(channel)
                    setBroadcastDialog({
                      ...broadcastDialog,
                      templateId: v,
                      channel,
                      connectedAccountId: accounts[0]?.id ?? "",
                    })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    {approvedTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {MESSAGE_CHANNEL_LABELS[t.channel]} · {t.name} · {t.language}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Audience</Label>
                <Select
                  value={broadcastDialog.audienceId || undefined}
                  onValueChange={(v) => setBroadcastDialog({ ...broadcastDialog, audienceId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select audience" />
                  </SelectTrigger>
                  <SelectContent>
                    {audiences.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({a.estimatedSize})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  {MESSAGE_CHANNEL_LABELS[broadcastDialog.channel]} account
                </Label>
                <Select
                  value={broadcastDialog.connectedAccountId || undefined}
                  onValueChange={(v) =>
                    setBroadcastDialog({ ...broadcastDialog, connectedAccountId: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={`Connect ${CHANNEL_PROVIDER[broadcastDialog.channel]} first`} />
                  </SelectTrigger>
                  <SelectContent>
                    {accountsForChannel(broadcastDialog.channel).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bc-vars">Variable map (JSON)</Label>
                <Textarea
                  id="bc-vars"
                  rows={3}
                  value={JSON.stringify(broadcastDialog.variableMapping, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value) as Record<string, string>
                      setBroadcastDialog({ ...broadcastDialog, variableMapping: parsed })
                    } catch {
                      // keep typing
                    }
                  }}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBroadcastDialog(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !broadcastDialog}
              onClick={() =>
                startTransition(async () => {
                  if (!broadcastDialog) return
                  const result = await saveBroadcastAction(workspace.slug, {
                    ...broadcastDialog,
                    status: "draft",
                  })
                  if (result.ok) {
                    setBroadcasts((list) => [result.data, ...list.filter((b) => b.id !== result.data.id)])
                    setBroadcastDialog(null)
                    toast.success("Broadcast saved")
                  } else toast.error(result.error)
                })
              }
            >
              Save draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(contactDialog)}
        onOpenChange={(open) => !open && setContactDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{contactDialog?.name ? "Edit contact" : "Add contact"}</DialogTitle>
            <DialogDescription>
              Phone should be E.164 or a 10-digit Indian mobile. Mark WhatsApp opt-in to test marketing
              templates.
            </DialogDescription>
          </DialogHeader>
          {contactDialog ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="contact-name">Name</Label>
                <Input
                  id="contact-name"
                  value={contactDialog.name}
                  onChange={(e) => setContactDialog({ ...contactDialog, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-phone">Phone</Label>
                <Input
                  id="contact-phone"
                  value={contactPhoneRaw}
                  onChange={(e) => setContactPhoneRaw(e.target.value)}
                  placeholder="+919876543210"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-email">Email (optional)</Label>
                <Input
                  id="contact-email"
                  value={contactDialog.email ?? ""}
                  onChange={(e) => setContactDialog({ ...contactDialog, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>WhatsApp consent</Label>
                <Select
                  value={contactDialog.consentWhatsapp}
                  onValueChange={(v) =>
                    setContactDialog({
                      ...contactDialog,
                      consentWhatsapp: v as Contact["consentWhatsapp"],
                      consentSms: v as Contact["consentSms"],
                      consentEmail: v as Contact["consentEmail"],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="opted_in">Opted in</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                    <SelectItem value="opted_out">Opted out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactDialog(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !contactDialog}
              onClick={() =>
                startTransition(async () => {
                  if (!contactDialog) return
                  const phone = contactPhoneRaw.trim()
                    ? normalizePhoneE164(contactPhoneRaw)
                    : null
                  if (phone && !phone.ok) {
                    toast.error(phone.error)
                    return
                  }
                  const now = new Date().toISOString()
                  const result = await saveContactAction(workspace.slug, {
                    ...contactDialog,
                    phoneE164: phone?.ok ? phone.e164 : null,
                    email: contactDialog.email || "",
                    consentWhatsappAt:
                      contactDialog.consentWhatsapp === "opted_in" ? now : null,
                    consentWhatsappEvidence:
                      contactDialog.consentWhatsapp === "opted_in" ? "manual:ui" : null,
                    updatedAt: now,
                  })
                  if (result.ok) {
                    setContacts((list) => [
                      result.data,
                      ...list.filter((c) => c.id !== result.data.id),
                    ])
                    setContactDialog(null)
                    toast.success("Contact saved")
                  } else toast.error(result.error)
                })
              }
            >
              Save contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(testSendTemplate)}
        onOpenChange={(open) => !open && setTestSendTemplate(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Test send · {testSendTemplate?.name}</DialogTitle>
            <DialogDescription>
              Sends to one contact now (creates an approval record and executes). Marketing templates
              need WhatsApp opt-in. One-off test sends bypass quiet hours; bulk broadcasts still respect
              them.
            </DialogDescription>
          </DialogHeader>
          {testSendTemplate ? (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                {testSendTemplate.bodyComponents.bodyText}
              </p>
              <div className="space-y-1.5">
                <Label>Recipient</Label>
                <Select
                  value={testContactMode}
                  onValueChange={(v) => setTestContactMode(v as "existing" | "new")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New contact</SelectItem>
                    <SelectItem value="existing" disabled={contacts.length === 0}>
                      Existing contact
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {testContactMode === "existing" ? (
                <div className="space-y-1.5">
                  <Label>Contact</Label>
                  <Select value={testContactId || undefined} onValueChange={setTestContactId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select contact" />
                    </SelectTrigger>
                    <SelectContent>
                      {contacts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name || "Unnamed"} · {c.phoneE164 ?? c.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="test-name">Name</Label>
                    <Input
                      id="test-name"
                      value={testContactName}
                      onChange={(e) => setTestContactName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="test-phone">Phone</Label>
                    <Input
                      id="test-phone"
                      value={testContactPhone}
                      onChange={(e) => setTestContactPhone(e.target.value)}
                      placeholder="+919876543210"
                    />
                  </div>
                </>
              )}
              {(testSendTemplate.channel === "whatsapp" &&
                (testSendTemplate.bodyComponents.headerFormat === "IMAGE" ||
                  testSendTemplate.bodyComponents.headerFormat === "VIDEO" ||
                  testSendTemplate.bodyComponents.headerFormat === "DOCUMENT" ||
                  !testSendTemplate.bodyComponents.headerFormat)) ? (
                <div className="space-y-1.5">
                  <Label htmlFor="test-header-media">
                    Header media URL
                    {testSendTemplate.bodyComponents.headerFormat
                      ? ` (${testSendTemplate.bodyComponents.headerFormat})`
                      : " (if template has image/video header)"}
                  </Label>
                  <Input
                    id="test-header-media"
                    value={testHeaderMediaUrl}
                    onChange={(e) => setTestHeaderMediaUrl(e.target.value)}
                    placeholder="https://…/header.jpg"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Meta requires a public HTTPS image/video URL matching the approved template header.
                    Re-sync templates after this update so header format is detected automatically.
                  </p>
                </div>
              ) : null}
              {listTemplatePlaceholders(testSendTemplate.bodyComponents.bodyText).map((ph) => (
                <div key={ph} className="space-y-1.5">
                  <Label htmlFor={`var-${ph}`}>Variable {`{{${ph}}}`}</Label>
                  <Input
                    id={`var-${ph}`}
                    value={testVariableValues[ph] ?? ""}
                    onChange={(e) =>
                      setTestVariableValues((prev) => ({ ...prev, [ph]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestSendTemplate(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !testSendTemplate || !canPublish}
              onClick={() =>
                startTransition(async () => {
                  if (!testSendTemplate) return
                  const accountId =
                    testSendTemplate.connectedAccountId ||
                    selectedWhatsappId ||
                    accountsForChannel(testSendTemplate.channel)[0]?.id
                  if (!accountId) {
                    toast.error("Connect a messaging account first")
                    return
                  }
                  const result = await testSendTemplateAction(workspace.slug, {
                    templateId: testSendTemplate.id,
                    connectedAccountId: accountId,
                    ...(testContactMode === "existing"
                      ? { contactId: testContactId }
                      : {
                          newContact: {
                            name: testContactName,
                            phone: testContactPhone,
                            consentWhatsapp: "opted_in",
                          },
                        }),
                    variableValues: testVariableValues,
                    headerMediaUrl: testHeaderMediaUrl.trim() || undefined,
                  })
                  if (result.ok) {
                    setContacts((list) => [
                      result.data.contact,
                      ...list.filter((c) => c.id !== result.data.contact.id),
                    ])
                    setBroadcasts((list) => [result.data.broadcast, ...list])
                    setTestSendTemplate(null)
                    toast.success("Test message sent")
                  } else toast.error(result.error)
                })
              }
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              Send test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
