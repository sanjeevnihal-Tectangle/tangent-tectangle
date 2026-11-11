"use client"

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  PlugZap,
  Plus,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Wrench,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { StatCard } from "@/components/data/stat-card"
import { PageHeader } from "@/components/page/page-header"
import { ErrorState } from "@/components/states/states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useCan, useWorkspace } from "@/components/workspace/workspace-provider"
import {
  connectIntegrationAccount,
  connectMcpIntegration,
  disconnectIntegrationAccount,
  ensureEncryptionKeyAction,
  saveIntegrationCredentials,
} from "@/features/integrations/actions"
import {
  CONNECTION_STATUS_LABELS,
  type ConnectedAccountView,
} from "@/lib/domain/social"
import {
  INTEGRATION_GUIDES,
  type IntegrationGuide,
} from "@/lib/integrations/guides"
import {
  CATEGORY_LABELS,
  type IntegrationCategory,
  type IntegrationStatusView,
} from "@/lib/integrations/providers"

function matchesProvider(
  account: ConnectedAccountView,
  providerId: string
): boolean {
  if (account.provider === providerId) return true
  if (providerId === "meta_ads" && account.provider === "meta") return true
  return false
}

export function IntegrationsWorkspace({
  integrations,
  initialAccounts,
  encryptionConfigured,
  appUrl,
  errorMsg,
  connectedProvider,
  initialOpenProvider,
}: {
  integrations: IntegrationStatusView[]
  initialAccounts: ConnectedAccountView[]
  encryptionConfigured: boolean
  appUrl: string
  errorMsg: string | null
  connectedProvider: string | null
  initialOpenProvider?: string | null
}) {
  const router = useRouter()
  const { workspace } = useWorkspace()
  const canManage = useCan("integrations.manage")

  const [accounts, setAccounts] = useState<ConnectedAccountView[]>(initialAccounts)
  const [encReady, setEncReady] = useState(encryptionConfigured)
  const [categoryFilter, setCategoryFilter] = useState<"all" | "connected" | IntegrationCategory>("all")

  const [activeProviderId, setActiveProviderId] = useState<string | null>(() =>
    initialOpenProvider && INTEGRATION_GUIDES[initialOpenProvider]
      ? initialOpenProvider
      : null
  )
  const [dialogTab, setDialogTab] = useState<
    "guide" | "connect" | "mcp" | "accounts"
  >("connect")

  const [pendingKey, startKeyTransition] = useTransition()

  const activeIntegration = integrations.find((i) => i.id === activeProviderId) ?? null
  const activeGuide = activeProviderId ? INTEGRATION_GUIDES[activeProviderId] ?? null : null

  const configuredProvidersCount = integrations.filter(
    (i) => i.status === "credentials_set"
  ).length

  const openModal = (
    providerId: string,
    defaultTab: "guide" | "connect" | "mcp" | "accounts"
  ) => {
    setActiveProviderId(providerId)
    setDialogTab(defaultTab)
  }

  const handleGenerateEncryptionKey = () => {
    startKeyTransition(async () => {
      const res = await ensureEncryptionKeyAction(workspace.slug)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setEncReady(true)
      toast.success("Generated 32-byte AES-256-GCM encryption key.")
      router.refresh()
    })
  }

  const categories = [
    ...new Set(integrations.map((i) => i.category)),
  ] as IntegrationCategory[]

  const filteredIntegrations = integrations.filter((item) => {
    if (categoryFilter === "all") return true
    if (categoryFilter === "connected") {
      const hasAcc = accounts.some((a) => matchesProvider(a, item.id))
      return hasAcc || (item.serverOnly && item.status === "credentials_set")
    }
    return item.category === categoryFilter
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations Hub"
        description="Connect social channels, ad accounts, search properties, AI models, and automation tools directly from Tangent with guided setup."
      />

      {errorMsg ? (
        <ErrorState
          title="Connection could not be completed"
          description={errorMsg}
        />
      ) : null}

      {connectedProvider ? (
        <div className="flex items-center gap-2 rounded-lg border bg-success-subtle p-3 text-sm">
          <CheckCircle2 className="size-4 text-success" />
          <span>
            Successfully connected <strong>{connectedProvider}</strong> account(s).
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Connected accounts"
          value={String(accounts.length)}
          change={null}
          hint="Social, Ads & Search Console"
        />
        <StatCard
          label="Configured providers"
          value={`${configuredProvidersCount} / ${integrations.length}`}
          change={null}
          hint="Server OAuth & API credentials"
        />
        <StatCard
          label="Token encryption"
          value={encReady ? "AES-256-GCM" : "Key needed"}
          change={null}
          hint={encReady ? "Private vault active" : "Click below to initialize"}
        />
        <StatCard
          label="Execution guardrails"
          value="100% Gated"
          change={null}
          hint="Every publish & spend requires sign-off"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3.5 text-sm">
          <div className="flex gap-3">
            <Lock className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="font-medium text-foreground">
                AES-256-GCM Encrypted Credential Vault
              </p>
              <p className="text-xs text-muted-foreground">
                OAuth tokens and API secrets are encrypted server-side and never sent to the browser.
              </p>
            </div>
          </div>
          {!encReady && canManage ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pendingKey}
              onClick={handleGenerateEncryptionKey}
            >
              {pendingKey ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <KeyRound className="size-3.5" />
              )}
              Initialize Key
            </Button>
          ) : (
            <Badge variant="success">Vault Ready</Badge>
          )}
        </div>

        <div className="flex gap-3 rounded-lg border bg-muted/30 p-3.5 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <p className="font-medium text-foreground">
              Three ways to connect every platform (OAuth, Direct Token & MCP)
            </p>
            <p className="text-xs text-muted-foreground">
              Connect via <strong>MCP Server (Model Context Protocol)</strong>, <strong>Direct Account / Token</strong>, or <strong>1-Click OAuth 2.0</strong> with step-by-step wizard guidance.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b pb-3">
        <Button
          type="button"
          size="xs"
          variant={categoryFilter === "all" ? "secondary" : "ghost"}
          onClick={() => setCategoryFilter("all")}
        >
          All ({integrations.length})
        </Button>
        <Button
          type="button"
          size="xs"
          variant={categoryFilter === "connected" ? "secondary" : "ghost"}
          onClick={() => setCategoryFilter("connected")}
        >
          Connected ({accounts.length + integrations.filter((i) => i.serverOnly && i.status === "credentials_set").length})
        </Button>
        {categories.map((cat) => (
          <Button
            key={cat}
            type="button"
            size="xs"
            variant={categoryFilter === cat ? "secondary" : "ghost"}
            onClick={() => setCategoryFilter(cat)}
          >
            {CATEGORY_LABELS[cat]}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredIntegrations.map((integration) => {
          const providerAccounts = accounts.filter((a) =>
            matchesProvider(a, integration.id)
          )
          const guide = INTEGRATION_GUIDES[integration.id]
          const isOAuthReady =
            !integration.serverOnly && integration.status === "credentials_set"
          const isConnected =
            providerAccounts.length > 0 ||
            (integration.serverOnly && integration.status === "credentials_set")

          return (
            <Card
              key={integration.id}
              className={
                isConnected
                  ? "flex flex-col border-brand/35"
                  : "flex flex-col"
              }
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">
                        {integration.name}
                      </CardTitle>
                      <Badge variant="outline" className="text-[10px]">
                        {CATEGORY_LABELS[integration.category]}
                      </Badge>
                    </div>
                    <CardDescription className="mt-1">
                      {integration.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="flex flex-1 flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {integration.serverOnly ? (
                      integration.status === "credentials_set" ? (
                        <Badge variant="success">Active on server</Badge>
                      ) : (
                        <Badge variant="muted">API key required</Badge>
                      )
                    ) : providerAccounts.length > 0 ? (
                      <Badge variant="success">
                        {providerAccounts.length} account
                        {providerAccounts.length > 1 ? "s" : ""} connected
                      </Badge>
                    ) : isOAuthReady ? (
                      <Badge variant="info">OAuth ready to connect</Badge>
                    ) : (
                      <Badge variant="muted">
                        Ready for guided setup ({guide?.estimatedMinutes ?? "3 min"})
                      </Badge>
                    )}

                    {integration.capabilities.map((cap) => (
                      <Badge key={cap} variant="outline" className="font-normal">
                        {cap}
                      </Badge>
                    ))}
                    {providerAccounts.some((a) =>
                      a.externalAccountId.startsWith("mcp:")
                    ) ? (
                      <Badge variant="brand">MCP Connected</Badge>
                    ) : (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        MCP Ready
                      </Badge>
                    )}
                  </div>

                  {providerAccounts.length > 0 ? (
                    <div className="space-y-1.5 rounded-lg border bg-muted/20 p-2.5">
                      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        Linked workspace accounts
                      </div>
                      {providerAccounts.map((acc) => (
                        <div
                          key={acc.id}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0 truncate">
                            <span className="font-medium">{acc.displayName}</span>{" "}
                            <span className="font-mono text-[11px] text-muted-foreground">
                              ({acc.externalAccountId})
                            </span>
                          </div>
                          <Badge
                            variant={
                              acc.status === "active" ? "brand" : "warning"
                            }
                            className="shrink-0 text-[10px]"
                          >
                            {CONNECTION_STATUS_LABELS[acc.status]}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {integration.missingEnvVars.length > 0 ? (
                    <div className="rounded-md bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        OAuth / Server keys:{" "}
                      </span>
                      {integration.missingEnvVars.map((name) => (
                        <code
                          key={name}
                          className="mr-1 rounded bg-background px-1 py-0.5 font-mono text-[11px]"
                        >
                          {name}
                        </code>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {!integration.serverOnly ? (
                    <>
                      <Button
                        type="button"
                        variant={providerAccounts.length > 0 ? "outline" : "brand"}
                        size="sm"
                        className="flex-1"
                        onClick={() => openModal(integration.id, "connect")}
                      >
                        <PlugZap className="size-3.5" />
                        {providerAccounts.length > 0
                          ? "Add / Connect"
                          : `Connect ${integration.name}`}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openModal(integration.id, "mcp")}
                      >
                        <Cpu className="size-3.5" />
                        MCP
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openModal(integration.id, "guide")}
                      >
                        <Wrench className="size-3.5" />
                        Guide
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant={
                          integration.status === "credentials_set"
                            ? "outline"
                            : "brand"
                        }
                        size="sm"
                        className="flex-1"
                        onClick={() => openModal(integration.id, "guide")}
                      >
                        <KeyRound className="size-3.5" />
                        {integration.status === "credentials_set"
                          ? "API Key & Guide"
                          : `Configure ${integration.name}`}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openModal(integration.id, "mcp")}
                      >
                        <Cpu className="size-3.5" />
                        MCP
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {activeIntegration && activeGuide ? (
        <IntegrationSetupDialog
          key={activeIntegration.id}
          integration={activeIntegration}
          guide={activeGuide}
          orgSlug={workspace.slug}
          appUrl={appUrl}
          canManage={canManage}
          defaultTab={dialogTab}
          accounts={accounts.filter((a) =>
            matchesProvider(a, activeIntegration.id)
          )}
          onClose={() => setActiveProviderId(null)}
          onAccountConnected={(newAcc) => {
            setAccounts((prev) => [
              newAcc,
              ...prev.filter((a) => a.id !== newAcc.id),
            ])
            router.refresh()
          }}
          onAccountDisconnected={(removedId) => {
            setAccounts((prev) => prev.filter((a) => a.id !== removedId))
            router.refresh()
          }}
          onCredentialsSaved={() => {
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}

type WizardMode = "choose" | "direct" | "mcp" | "oauth" | "server" | "accounts"

function IntegrationSetupDialog({
  integration,
  guide,
  orgSlug,
  appUrl,
  canManage,
  defaultTab,
  accounts,
  onClose,
  onAccountConnected,
  onAccountDisconnected,
  onCredentialsSaved,
}: {
  integration: IntegrationStatusView
  guide: IntegrationGuide
  orgSlug: string
  appUrl: string
  canManage: boolean
  defaultTab: "guide" | "connect" | "mcp" | "accounts"
  accounts: ConnectedAccountView[]
  onClose: () => void
  onAccountConnected: (account: ConnectedAccountView) => void
  onAccountDisconnected: (accountId: string) => void
  onCredentialsSaved: () => void
}) {
  // Determine initial wizard mode & step based on whether user clicked "Connect", "MCP", or "Setup Guide"
  const [mode, setMode] = useState<WizardMode>(() => {
    if (defaultTab === "mcp") return "mcp"
    if (defaultTab === "accounts") return "accounts"
    if (integration.serverOnly) {
      return defaultTab === "guide" ? "server" : "choose"
    }
    if (defaultTab === "guide") return "oauth"
    return "choose"
  })

  // Step index within the active wizard flow (1-based)
  const [step, setStep] = useState<number>(1)
  // Sub-step index for interactive developer console instructions (0-based)
  const [guideStepIdx, setGuideStepIdx] = useState<number>(0)

  const [envValues, setEnvValues] = useState<Record<string, string>>({})
  const [copiedUri, setCopiedUri] = useState(false)
  const [copiedScopes, setCopiedScopes] = useState(false)
  const [copiedMcpCmd, setCopiedMcpCmd] = useState(false)
  const [copiedMcpJson, setCopiedMcpJson] = useState(false)

  // Direct account connect form state
  const [displayName, setDisplayName] = useState("")
  const [externalAccountId, setExternalAccountId] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [verifyWithApi, setVerifyWithApi] = useState(false)
  const [dailySpendLimitInr, setDailySpendLimitInr] = useState("2500")
  const [monthlySpendLimitInr, setMonthlySpendLimitInr] = useState("50000")

  // MCP server connect form state
  const [mcpLabel, setMcpLabel] = useState(`${integration.name} MCP Server`)
  const [mcpTransport, setMcpTransport] = useState<
    "sse" | "streamable_http" | "stdio"
  >("sse")
  const [mcpEndpointOrCommand, setMcpEndpointOrCommand] = useState(
    guide.mcp.defaultEndpointPlaceholder
  )
  const [mcpAuthToken, setMcpAuthToken] = useState("")
  const [mcpVerifyEndpoint, setMcpVerifyEndpoint] = useState(false)

  const [savingCreds, startSavingCreds] = useTransition()
  const [connecting, startConnecting] = useTransition()
  const [connectingMcp, startConnectingMcp] = useTransition()
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)

  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/integrations/${integration.id}/callback`
  const oauthConnectHref = `/api/integrations/${integration.id}/connect?workspace=${encodeURIComponent(orgSlug)}`
  const isOAuthConfigured = integration.missingEnvVars.length === 0

  const mcpSnippetJson = JSON.stringify(
    {
      mcpServers: {
        [integration.id]: {
          command: "npx",
          args: guide.mcp.npxCommand.replace(/^npx\s+/, "").split(" "),
        },
      },
    },
    null,
    2
  )

  const copyRedirectUri = async () => {
    await navigator.clipboard.writeText(redirectUri)
    setCopiedUri(true)
    setTimeout(() => setCopiedUri(false), 2000)
    toast.success("Copied OAuth Redirect URI to clipboard.")
  }

  const copyScopes = async () => {
    await navigator.clipboard.writeText(guide.requiredScopes.join(","))
    setCopiedScopes(true)
    setTimeout(() => setCopiedScopes(false), 2000)
    toast.success("Copied required scopes to clipboard.")
  }

  const copyMcpCommand = async () => {
    await navigator.clipboard.writeText(guide.mcp.npxCommand)
    setCopiedMcpCmd(true)
    setTimeout(() => setCopiedMcpCmd(false), 2000)
    toast.success("Copied MCP npx command to clipboard.")
  }

  const copyMcpJson = async () => {
    await navigator.clipboard.writeText(mcpSnippetJson)
    setCopiedMcpJson(true)
    setTimeout(() => setCopiedMcpJson(false), 2000)
    toast.success("Copied mcpServers JSON config to clipboard.")
  }

  const handleTransportChange = (
    nextTransport: "sse" | "streamable_http" | "stdio"
  ) => {
    setMcpTransport(nextTransport)
    if (nextTransport === "stdio") {
      setMcpEndpointOrCommand(guide.mcp.npxCommand)
    } else if (
      mcpEndpointOrCommand === guide.mcp.npxCommand ||
      !mcpEndpointOrCommand.trim()
    ) {
      setMcpEndpointOrCommand(guide.mcp.defaultEndpointPlaceholder)
    }
  }

  const handleSaveCredentials = () => {
    startSavingCreds(async () => {
      const res = await saveIntegrationCredentials(orgSlug, {
        providerId: integration.id,
        values: envValues,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setEnvValues({})
      toast.success(
        `Saved ${res.data.savedKeys.join(", ")} for ${integration.name}.`
      )
      onCredentialsSaved()
      if (integration.serverOnly) {
        onClose()
      } else {
        // Advance to final launch step
        setStep(3)
      }
    })
  }

  const handleDirectConnect = () => {
    if (!displayName.trim() || !externalAccountId.trim()) {
      toast.error("Enter both the account name and account ID / handle.")
      return
    }
    startConnecting(async () => {
      const res = await connectIntegrationAccount(orgSlug, {
        providerId: integration.id,
        displayName: displayName.trim(),
        externalAccountId: externalAccountId.trim(),
        accessToken: accessToken.trim() || undefined,
        verifyWithApi: verifyWithApi && Boolean(accessToken.trim()),
        dailySpendLimitInr: guide.directConnect?.isAdAccount
          ? Number(dailySpendLimitInr) || 2500
          : undefined,
        monthlySpendLimitInr: guide.directConnect?.isAdAccount
          ? Number(monthlySpendLimitInr) || 50000
          : undefined,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Connected ${res.data.displayName} to ${integration.name}.`)
      setDisplayName("")
      setExternalAccountId("")
      setAccessToken("")
      onAccountConnected(res.data)
      setMode("accounts")
    })
  }

  const handleMcpConnect = () => {
    if (!mcpLabel.trim() || !mcpEndpointOrCommand.trim()) {
      toast.error("Enter both an MCP connection label and the URL or npx command.")
      return
    }
    startConnectingMcp(async () => {
      const res = await connectMcpIntegration(orgSlug, {
        providerId: integration.id,
        serverLabel: mcpLabel.trim(),
        transport: mcpTransport,
        endpointOrCommand: mcpEndpointOrCommand.trim(),
        authToken: mcpAuthToken.trim() || undefined,
        verifyEndpoint: mcpVerifyEndpoint && mcpTransport !== "stdio",
        dailySpendLimitInr: guide.directConnect?.isAdAccount
          ? Number(dailySpendLimitInr) || 2500
          : undefined,
        monthlySpendLimitInr: guide.directConnect?.isAdAccount
          ? Number(monthlySpendLimitInr) || 50000
          : undefined,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Connected ${res.data.displayName} via MCP.`)
      setMcpAuthToken("")
      onAccountConnected(res.data)
      setMode("accounts")
    })
  }

  const handleDisconnect = async (accountId: string) => {
    setDisconnectingId(accountId)
    try {
      const res = await disconnectIntegrationAccount(orgSlug, accountId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Disconnected account.")
      onAccountDisconnected(accountId)
    } finally {
      setDisconnectingId(null)
    }
  }

  const oauthSteps = [
    { num: 1, label: "Developer Console & URI" },
    { num: 2, label: "App Credentials" },
    { num: 3, label: "Authorize Account" },
  ]

  const mcpSteps = [
    { num: 1, label: "MCP Server & Agent Tools" },
    { num: 2, label: "Link MCP Endpoint / Command" },
  ]

  const serverSteps = [
    { num: 1, label: "Developer Console Walkthrough" },
    { num: 2, label: "Paste & Activate API Key" },
  ]

  const currentGuideStep = guide.steps[guideStepIdx] ?? guide.steps[0]

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl sm:max-w-3xl overflow-x-hidden">
        <DialogHeader className="border-b pb-3 pr-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-lg">
                {integration.name}
              </DialogTitle>
              <Badge variant="outline">{guide.estimatedMinutes}</Badge>
              {isOAuthConfigured && !integration.serverOnly ? (
                <Badge variant="success">OAuth Ready</Badge>
              ) : null}
              <Badge variant="outline" className="font-mono text-[10px]">
                MCP Supported
              </Badge>
            </div>

            <div className="flex items-center gap-1.5">
              {mode !== "choose" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setMode("choose")
                    setStep(1)
                  }}
                >
                  <ArrowLeft className="size-3" />
                  All Methods
                </Button>
              ) : null}
              <Button
                type="button"
                variant={mode === "mcp" ? "secondary" : "outline"}
                size="xs"
                onClick={() => {
                  setMode("mcp")
                  setStep(1)
                }}
              >
                <Cpu className="size-3" />
                MCP Wizard
              </Button>
              <Button
                type="button"
                variant={mode === "accounts" ? "secondary" : "outline"}
                size="xs"
                onClick={() => setMode("accounts")}
              >
                Connected ({accounts.length})
              </Button>
            </div>
          </div>
          <DialogDescription className="line-clamp-1">
            {guide.summary}
          </DialogDescription>
        </DialogHeader>

        {/* MODE 1: CHOOSE CONNECTION METHOD (3 clean side-by-side cards for account providers, 2 for server-only) */}
        {mode === "choose" ? (
          <div className="space-y-4 pt-1">
            <div className="text-xs font-medium text-muted-foreground">
              Step 1 of 2 — Choose how you want to connect {integration.name}:
            </div>

            <div
              className={
                integration.serverOnly
                  ? "grid gap-3.5 sm:grid-cols-2"
                  : "grid gap-3.5 sm:grid-cols-3"
              }
            >
              {/* Card A: Quick Account / Token Connect (or Server API Key for server-only) */}
              {!integration.serverOnly ? (
                <div className="flex flex-col justify-between rounded-xl border bg-card p-3.5 transition-colors hover:border-brand/50">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Link2 className="size-4" />
                      </span>
                      <Badge variant="brand">Fastest · 1 min</Badge>
                    </div>
                    <h4 className="font-semibold text-sm">
                      Direct Account / Token
                    </h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Link immediately using your{" "}
                      <strong>
                        {guide.directConnect?.externalIdLabel ?? "Account ID"}
                      </strong>{" "}
                      and an optional Access Token.
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="brand"
                    size="sm"
                    className="mt-4 w-full"
                    onClick={() => {
                      setMode("direct")
                      setStep(1)
                    }}
                  >
                    Direct Connect
                    <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col justify-between rounded-xl border bg-card p-4 transition-colors hover:border-brand/50">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <KeyRound className="size-4" />
                      </span>
                      <Badge variant="brand">Direct API Key</Badge>
                    </div>
                    <h4 className="font-semibold text-sm">
                      Server API Key Setup
                    </h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Step-by-step walkthrough to grab your {integration.name} key from {guide.developerPortalName} and activate it on the server.
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="brand"
                    size="sm"
                    className="mt-4 w-full"
                    onClick={() => {
                      setMode("server")
                      setStep(1)
                    }}
                  >
                    Configure API Key
                    <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              )}

              {/* Card B: MCP Server Connect (Model Context Protocol) — available for ALL 12 platforms */}
              <div className="flex flex-col justify-between rounded-xl border bg-card p-3.5 transition-colors hover:border-brand/50">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Cpu className="size-4" />
                    </span>
                    <Badge variant="info">Agent-Native · MCP</Badge>
                  </div>
                  <h4 className="font-semibold text-sm">
                    MCP Server Connect
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Connect via <strong>{guide.mcp.serverName}</strong> (Remote SSE / HTTP URL or{" "}
                    <code className="font-mono text-[10px]">
                      {guide.mcp.packageName}
                    </code>
                    ) to expose {guide.mcp.availableTools.length} MCP tools to AI agents.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4 w-full"
                  onClick={() => {
                    setMode("mcp")
                    setStep(1)
                  }}
                >
                  <Cpu className="size-3.5" />
                  Connect via MCP
                </Button>
              </div>

              {/* Card C: Guided 1-Click OAuth 2.0 (for non-serverOnly providers) */}
              {!integration.serverOnly ? (
                <div className="flex flex-col justify-between rounded-xl border bg-muted/20 p-3.5 transition-colors hover:border-brand/50">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <PlugZap className="size-4" />
                      </span>
                      {isOAuthConfigured ? (
                        <Badge variant="success">Keys Ready</Badge>
                      ) : (
                        <Badge variant="outline">3-Step Wizard</Badge>
                      )}
                    </div>
                    <h4 className="font-semibold text-sm">
                      Official OAuth 2.0
                    </h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {isOAuthConfigured
                        ? `Your ${integration.name} OAuth app keys are active. Authorize in one click.`
                        : `Guided wizard to register Callback URI in ${guide.developerPortalName} and launch OAuth.`}
                    </p>
                  </div>

                  {isOAuthConfigured && canManage ? (
                    <div className="mt-4 flex gap-1.5">
                      <Button asChild variant="brand" size="sm" className="flex-1">
                        <a href={oauthConnectHref}>
                          <PlugZap className="size-3.5" />
                          Launch
                        </a>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setMode("oauth")
                          setStep(1)
                        }}
                      >
                        Guide
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-4 w-full"
                      onClick={() => {
                        setMode("oauth")
                        setStep(1)
                      }}
                    >
                      OAuth Setup Wizard
                      <ArrowRight className="size-3.5" />
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* MODE 2B: STEP-BY-STEP MCP (MODEL CONTEXT PROTOCOL) WIZARD */}
        {mode === "mcp" ? (
          <div className="space-y-4 pt-1">
            {/* 2-Step Stepper Header */}
            <div className="grid grid-cols-2 gap-2">
              {mcpSteps.map((s) => {
                const active = step === s.num
                const done = step > s.num
                return (
                  <button
                    key={s.num}
                    type="button"
                    onClick={() => setStep(s.num)}
                    className={
                      active
                        ? "flex items-center gap-2 rounded-lg border border-brand bg-brand/10 px-3 py-2 text-left text-xs font-medium text-foreground"
                        : "flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-left text-xs text-muted-foreground"
                    }
                  >
                    <span
                      className={
                        active
                          ? "flex size-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-brand-foreground"
                          : done
                            ? "flex size-5 shrink-0 items-center justify-center rounded-full bg-success/20 text-[11px] font-semibold text-success"
                            : "flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold"
                      }
                    >
                      {done && !active ? <Check className="size-3" /> : s.num}
                    </span>
                    <span className="truncate">{s.label}</span>
                  </button>
                )
              })}
            </div>

            {step === 1 ? (
              <div className="space-y-3.5">
                <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Cpu className="size-4 text-primary" />
                      <span className="text-sm font-semibold">
                        {guide.mcp.serverName}
                      </span>
                    </div>
                    <Button asChild variant="outline" size="xs">
                      <a
                        href={guide.mcp.documentationUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        MCP Docs
                        <ExternalLink className="size-3" />
                      </a>
                    </Button>
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {guide.mcp.steps.map((st, idx) => (
                      <div
                        key={st.title}
                        className="rounded-lg border bg-background p-2.5 text-xs space-y-1"
                      >
                        <div className="font-medium text-foreground">
                          {idx + 1}. {st.title}
                        </div>
                        <p className="text-muted-foreground leading-relaxed">
                          {st.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium flex items-center gap-1.5">
                        <Terminal className="size-3.5 text-primary" />
                        Standard MCP Server Command
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={copyMcpCommand}
                        >
                          {copiedMcpCmd ? (
                            <Check className="size-3" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                          Copy CLI
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={copyMcpJson}
                        >
                          {copiedMcpJson ? (
                            <Check className="size-3" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                          JSON
                        </Button>
                      </div>
                    </div>
                    <code className="block truncate rounded border bg-muted/30 px-2.5 py-1.5 font-mono text-[11px]">
                      {guide.mcp.npxCommand}
                    </code>
                  </div>

                  <div className="rounded-xl border p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">
                        AI Agent MCP Tools ({guide.mcp.availableTools.length})
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        Approval-Gated Writes
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {guide.mcp.availableTools.map((toolName) => (
                        <code
                          key={toolName}
                          className="rounded border bg-muted/30 px-1.5 py-0.5 font-mono text-[10px]"
                        >
                          {toolName}
                        </code>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setMode("choose")}
                  >
                    <ArrowLeft className="size-3.5" />
                    Back
                  </Button>
                  <Button
                    type="button"
                    variant="brand"
                    size="sm"
                    onClick={() => setStep(2)}
                  >
                    Next: Link MCP Server
                    <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <fieldset
                  disabled={!canManage || connectingMcp}
                  className="min-w-0 space-y-3.5 rounded-xl border bg-muted/15 p-4"
                >
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="mcp-label" className="text-xs">
                        MCP Connection Label
                      </Label>
                      <Input
                        id="mcp-label"
                        value={mcpLabel}
                        onChange={(e) => setMcpLabel(e.target.value)}
                        placeholder={`e.g. ${integration.name} MCP Server`}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">MCP Transport Protocol</Label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            { id: "sse", label: "Remote SSE" },
                            { id: "streamable_http", label: "HTTP Stream" },
                            { id: "stdio", label: "Stdio / NPX" },
                          ] as const
                        ).map((t) => (
                          <Button
                            key={t.id}
                            type="button"
                            size="xs"
                            variant={
                              mcpTransport === t.id ? "brand" : "outline"
                            }
                            onClick={() => handleTransportChange(t.id)}
                          >
                            {t.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="mcp-endpoint" className="text-xs">
                        {mcpTransport === "stdio"
                          ? "NPX / Stdio Server Command"
                          : "Remote MCP Server URL (SSE / Streamable HTTP)"}
                      </Label>
                      <Input
                        id="mcp-endpoint"
                        value={mcpEndpointOrCommand}
                        onChange={(e) => setMcpEndpointOrCommand(e.target.value)}
                        placeholder={
                          mcpTransport === "stdio"
                            ? guide.mcp.npxCommand
                            : guide.mcp.defaultEndpointPlaceholder
                        }
                        className="font-mono text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="mcp-token" className="text-xs">
                        MCP Bearer / API Token (optional, AES-256-GCM encrypted)
                      </Label>
                      <Input
                        id="mcp-token"
                        type="password"
                        value={mcpAuthToken}
                        onChange={(e) => setMcpAuthToken(e.target.value)}
                        placeholder="Bearer token or provider API secret..."
                      />
                    </div>
                  </div>

                  {guide.directConnect?.isAdAccount ? (
                    <div className="grid gap-3.5 sm:grid-cols-2 rounded-lg border bg-background p-3">
                      <div className="space-y-1">
                        <Label htmlFor="mcp-daily-cap" className="text-xs">
                          Daily Spend Cap (₹ INR)
                        </Label>
                        <Input
                          id="mcp-daily-cap"
                          type="number"
                          min={100}
                          value={dailySpendLimitInr}
                          onChange={(e) => setDailySpendLimitInr(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="mcp-monthly-cap" className="text-xs">
                          Monthly Spend Cap (₹ INR)
                        </Label>
                        <Input
                          id="mcp-monthly-cap"
                          type="number"
                          min={500}
                          value={monthlySpendLimitInr}
                          onChange={(e) =>
                            setMonthlySpendLimitInr(e.target.value)
                          }
                        />
                      </div>
                    </div>
                  ) : null}

                  {mcpTransport !== "stdio" ? (
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={mcpVerifyEndpoint}
                        onChange={(e) => setMcpVerifyEndpoint(e.target.checked)}
                        className="rounded border-input"
                      />
                      <span>
                        Ping remote MCP server URL live before saving
                      </span>
                    </label>
                  ) : null}
                </fieldset>

                <div className="flex items-center justify-between pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setStep(1)}
                  >
                    <ArrowLeft className="size-3.5" />
                    Back to MCP Overview
                  </Button>
                  <Button
                    type="button"
                    variant="brand"
                    size="sm"
                    disabled={!canManage || connectingMcp}
                    onClick={handleMcpConnect}
                  >
                    {connectingMcp ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Cpu className="size-4" />
                    )}
                    Connect {integration.name} MCP Server
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* MODE 2: DIRECT ACCOUNT / TOKEN CONNECT (Focused single-screen form) */}
        {mode === "direct" && guide.directConnect ? (
          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-muted-foreground">
                Step 2 of 2 — Enter your {integration.name} account details
              </div>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => {
                  setMode("oauth")
                  setStep(1)
                }}
              >
                Need help finding your ID or token?
              </Button>
            </div>

            <fieldset
              disabled={!canManage || connecting}
              className="min-w-0 space-y-3.5 rounded-xl border bg-muted/15 p-4"
            >
              <div className="grid gap-3.5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="direct-name" className="text-xs">
                    {guide.directConnect.accountNameLabel}
                  </Label>
                  <Input
                    id="direct-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={guide.directConnect.accountNamePlaceholder}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="direct-id" className="text-xs">
                    {guide.directConnect.externalIdLabel}
                  </Label>
                  <Input
                    id="direct-id"
                    value={externalAccountId}
                    onChange={(e) => setExternalAccountId(e.target.value)}
                    placeholder={guide.directConnect.externalIdPlaceholder}
                  />
                </div>
              </div>

              {guide.directConnect.isAdAccount ? (
                <div className="grid gap-3.5 sm:grid-cols-2 rounded-lg border bg-background p-3">
                  <div className="space-y-1">
                    <Label htmlFor="daily-cap" className="text-xs">
                      Daily Spend Cap (₹ INR)
                    </Label>
                    <Input
                      id="daily-cap"
                      type="number"
                      min={100}
                      value={dailySpendLimitInr}
                      onChange={(e) => setDailySpendLimitInr(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="monthly-cap" className="text-xs">
                      Monthly Spend Cap (₹ INR)
                    </Label>
                    <Input
                      id="monthly-cap"
                      type="number"
                      min={500}
                      value={monthlySpendLimitInr}
                      onChange={(e) => setMonthlySpendLimitInr(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="direct-token" className="text-xs">
                  {guide.directConnect.tokenLabel}
                </Label>
                <Input
                  id="direct-token"
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder={guide.directConnect.tokenPlaceholder}
                />
                <p className="text-[11px] text-muted-foreground">
                  {guide.directConnect.tokenHelp}
                </p>
              </div>

              {guide.directConnect.supportsLiveVerification &&
              accessToken.trim().length > 0 ? (
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={verifyWithApi}
                    onChange={(e) => setVerifyWithApi(e.target.checked)}
                    className="rounded border-input"
                  />
                  <span>
                    Verify token live against {integration.name} API before saving
                  </span>
                </label>
              ) : null}
            </fieldset>

            <div className="flex items-center justify-between pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMode("choose")}
              >
                <ArrowLeft className="size-3.5" />
                Back
              </Button>
              <Button
                type="button"
                variant="brand"
                size="sm"
                disabled={!canManage || connecting}
                onClick={handleDirectConnect}
              >
                {connecting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Connect {integration.name} Account
              </Button>
            </div>
          </div>
        ) : null}

        {/* MODE 3: STEP-BY-STEP OAUTH 2.0 WIZARD */}
        {mode === "oauth" && !integration.serverOnly ? (
          <div className="space-y-4 pt-1">
            {/* Stepper Header */}
            <div className="grid grid-cols-3 gap-2">
              {oauthSteps.map((s) => {
                const active = step === s.num
                const done = step > s.num || (s.num === 2 && isOAuthConfigured)
                return (
                  <button
                    key={s.num}
                    type="button"
                    onClick={() => setStep(s.num)}
                    className={
                      active
                        ? "flex items-center gap-2 rounded-lg border border-brand bg-brand/10 px-3 py-2 text-left text-xs font-medium text-foreground"
                        : done
                          ? "flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-left text-xs text-foreground"
                          : "flex items-center gap-2 rounded-lg border bg-muted/15 px-3 py-2 text-left text-xs text-muted-foreground"
                    }
                  >
                    <span
                      className={
                        active
                          ? "flex size-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-brand-foreground"
                          : done
                            ? "flex size-5 shrink-0 items-center justify-center rounded-full bg-success/20 text-[11px] font-semibold text-success"
                            : "flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold"
                      }
                    >
                      {done && !active ? <Check className="size-3" /> : s.num}
                    </span>
                    <span className="truncate">{s.label}</span>
                  </button>
                )
              })}
            </div>

            {/* OAuth Step 1: Interactive Console Walkthrough & Callback URI */}
            {step === 1 ? (
              <div className="space-y-3.5">
                <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="brand">
                        Console Tip {guideStepIdx + 1} of {guide.steps.length}
                      </Badge>
                      <span className="text-xs font-semibold text-foreground">
                        {currentGuideStep?.title}
                      </span>
                    </div>
                    <Button asChild variant="outline" size="xs">
                      <a
                        href={guide.developerPortalUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open {guide.developerPortalName}
                        <ExternalLink className="size-3" />
                      </a>
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {currentGuideStep?.description}
                  </p>

                  <div className="flex items-center justify-between border-t pt-2.5">
                    <div className="flex gap-1">
                      {guide.steps.map((s, idx) => (
                        <button
                          key={s.title}
                          type="button"
                          onClick={() => setGuideStepIdx(idx)}
                          className={
                            idx === guideStepIdx
                              ? "h-1.5 w-6 rounded-full bg-brand transition-all"
                              : "h-1.5 w-2 rounded-full bg-muted-foreground/30 transition-all"
                          }
                          aria-label={`Tip ${idx + 1}`}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        disabled={guideStepIdx === 0}
                        onClick={() => setGuideStepIdx((i) => Math.max(0, i - 1))}
                      >
                        Prev Tip
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled={guideStepIdx >= guide.steps.length - 1}
                        onClick={() =>
                          setGuideStepIdx((i) =>
                            Math.min(guide.steps.length - 1, i + 1)
                          )
                        }
                      >
                        Next Tip
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">
                        OAuth Callback URI
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={copyRedirectUri}
                      >
                        {copiedUri ? (
                          <Check className="size-3" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                        Copy URI
                      </Button>
                    </div>
                    <code className="block truncate rounded border bg-muted/30 px-2 py-1.5 font-mono text-[11px]">
                      {redirectUri}
                    </code>
                  </div>

                  <div className="rounded-xl border p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">
                        Required Scopes ({guide.requiredScopes.length})
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={copyScopes}
                      >
                        {copiedScopes ? (
                          <Check className="size-3" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                        Copy All
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {guide.requiredScopes.map((scope) => (
                        <code
                          key={scope}
                          className="rounded border bg-muted/30 px-1.5 py-0.5 font-mono text-[10px]"
                        >
                          {scope}
                        </code>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setMode("choose")}
                  >
                    <ArrowLeft className="size-3.5" />
                    Back
                  </Button>
                  <Button
                    type="button"
                    variant="brand"
                    size="sm"
                    onClick={() => setStep(2)}
                  >
                    Next: Enter App Credentials
                    <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              </div>
            ) : null}

            {/* OAuth Step 2: Paste Client ID & Secret */}
            {step === 2 ? (
              <div className="space-y-4">
                <fieldset
                  disabled={!canManage || savingCreds}
                  className="min-w-0 space-y-3 rounded-xl border bg-muted/15 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-sm flex items-center gap-1.5">
                        <KeyRound className="size-4 text-primary" />
                        Paste {integration.name} App Keys
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Saved directly to `.env` on the server and activated immediately.
                      </p>
                    </div>
                    {isOAuthConfigured ? (
                      <Badge variant="success">Already Configured</Badge>
                    ) : null}
                  </div>

                  <div className="grid gap-3.5 sm:grid-cols-2">
                    {guide.envFields.map((field) => {
                      const isMissing = integration.missingEnvVars.includes(
                        field.key
                      )
                      return (
                        <div key={field.key} className="space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <Label
                              htmlFor={`env-${field.key}`}
                              className="text-xs truncate"
                            >
                              {field.label}
                            </Label>
                            <Badge
                              variant={isMissing ? "muted" : "success"}
                              className="shrink-0 text-[10px]"
                            >
                              {isMissing ? "Needed" : "Set"}
                            </Badge>
                          </div>
                          <Input
                            id={`env-${field.key}`}
                            type={field.secret ? "password" : "text"}
                            value={envValues[field.key] ?? ""}
                            onChange={(e) =>
                              setEnvValues((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                              }))
                            }
                            placeholder={
                              isMissing
                                ? field.placeholder
                                : "•••••••• (configured — enter to replace)"
                            }
                          />
                          <p className="text-[11px] text-muted-foreground line-clamp-1">
                            {field.helpText}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </fieldset>

                <div className="flex items-center justify-between pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setStep(1)}
                  >
                    <ArrowLeft className="size-3.5" />
                    Back to URI & Console
                  </Button>
                  <div className="flex items-center gap-2">
                    {isOAuthConfigured ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setStep(3)}
                      >
                        Skip to Authorize
                        <ArrowRight className="size-3.5" />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="brand"
                      size="sm"
                      disabled={!canManage || savingCreds}
                      onClick={handleSaveCredentials}
                    >
                      {savingCreds ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Sparkles className="size-4" />
                      )}
                      Save Keys & Continue
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* OAuth Step 3: Authorize Account */}
            {step === 3 ? (
              <div className="space-y-4">
                <div className="rounded-xl border bg-muted/20 p-5 text-center space-y-3">
                  <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <PlugZap className="size-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-semibold text-base">
                      Ready to Authorize with {integration.name}
                    </h4>
                    <p className="mx-auto max-w-md text-xs text-muted-foreground">
                      You will be redirected to {integration.name} to grant access. Once approved, Tangent will encrypt your tokens and link your accounts automatically.
                    </p>
                  </div>

                  <div className="pt-2 flex flex-wrap justify-center gap-2">
                    {canManage ? (
                      <Button asChild variant="brand" size="sm">
                        <a href={oauthConnectHref}>
                          <PlugZap className="size-4" />
                          Authorize with {integration.name} Now
                        </a>
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setMode("direct")}
                    >
                      Or Use Direct Token Connect
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setStep(2)}
                  >
                    <ArrowLeft className="size-3.5" />
                    Back to App Keys
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* MODE 4: SERVER-ONLY INTEGRATIONS (2-Step Wizard: OpenAI, Anthropic, n8n, Razorpay) */}
        {mode === "server" && integration.serverOnly ? (
          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-2">
              {serverSteps.map((s) => {
                const active = step === s.num
                const done = step > s.num || (s.num === 2 && isOAuthConfigured)
                return (
                  <button
                    key={s.num}
                    type="button"
                    onClick={() => setStep(s.num)}
                    className={
                      active
                        ? "flex items-center gap-2 rounded-lg border border-brand bg-brand/10 px-3 py-2 text-left text-xs font-medium text-foreground"
                        : "flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-left text-xs text-muted-foreground"
                    }
                  >
                    <span
                      className={
                        active
                          ? "flex size-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-brand-foreground"
                          : "flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold"
                      }
                    >
                      {done && !active ? <Check className="size-3" /> : s.num}
                    </span>
                    <span className="truncate">{s.label}</span>
                  </button>
                )
              })}
            </div>

            {step === 1 ? (
              <div className="space-y-4">
                <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="brand">
                        Step {guideStepIdx + 1} of {guide.steps.length}
                      </Badge>
                      <span className="text-xs font-semibold">
                        {currentGuideStep?.title}
                      </span>
                    </div>
                    <Button asChild variant="outline" size="xs">
                      <a
                        href={guide.developerPortalUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open {guide.developerPortalName}
                        <ExternalLink className="size-3" />
                      </a>
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {currentGuideStep?.description}
                  </p>

                  <div className="flex items-center justify-between border-t pt-2.5">
                    <div className="flex gap-1">
                      {guide.steps.map((s, idx) => (
                        <button
                          key={s.title}
                          type="button"
                          onClick={() => setGuideStepIdx(idx)}
                          className={
                            idx === guideStepIdx
                              ? "h-1.5 w-6 rounded-full bg-brand transition-all"
                              : "h-1.5 w-2 rounded-full bg-muted-foreground/30 transition-all"
                          }
                          aria-label={`Step ${idx + 1}`}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        disabled={guideStepIdx === 0}
                        onClick={() => setGuideStepIdx((i) => Math.max(0, i - 1))}
                      >
                        Prev
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled={guideStepIdx >= guide.steps.length - 1}
                        onClick={() =>
                          setGuideStepIdx((i) =>
                            Math.min(guide.steps.length - 1, i + 1)
                          )
                        }
                      >
                        Next Tip
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="brand"
                    size="sm"
                    onClick={() => setStep(2)}
                  >
                    Next: Paste API Key
                    <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <fieldset
                  disabled={!canManage || savingCreds}
                  className="min-w-0 space-y-3 rounded-xl border bg-muted/15 p-4"
                >
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    {guide.envFields.map((field) => {
                      const isMissing = integration.missingEnvVars.includes(
                        field.key
                      )
                      return (
                        <div
                          key={field.key}
                          className={
                            guide.envFields.length === 1
                              ? "space-y-1 sm:col-span-2"
                              : "space-y-1"
                          }
                        >
                          <div className="flex items-center justify-between">
                            <Label
                              htmlFor={`env-${field.key}`}
                              className="text-xs"
                            >
                              {field.label}
                            </Label>
                            <Badge
                              variant={isMissing ? "muted" : "success"}
                              className="text-[10px]"
                            >
                              {isMissing ? "Not set" : "Active on server"}
                            </Badge>
                          </div>
                          <Input
                            id={`env-${field.key}`}
                            type={field.secret ? "password" : "text"}
                            value={envValues[field.key] ?? ""}
                            onChange={(e) =>
                              setEnvValues((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                              }))
                            }
                            placeholder={
                              isMissing
                                ? field.placeholder
                                : "•••••••• (already set — enter new value to replace)"
                            }
                          />
                          <p className="text-[11px] text-muted-foreground">
                            {field.helpText}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </fieldset>

                <div className="flex items-center justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setStep(1)}
                  >
                    <ArrowLeft className="size-3.5" />
                    Back to Walkthrough
                  </Button>
                  <Button
                    type="button"
                    variant="brand"
                    size="sm"
                    disabled={!canManage || savingCreds}
                    onClick={handleSaveCredentials}
                  >
                    {savingCreds ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    Save & Activate {integration.name}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* MODE 5: CONNECTED ACCOUNTS & MCP SERVERS VIEW */}
        {mode === "accounts" ? (
          <div className="space-y-3 pt-1">
            {accounts.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground space-y-2">
                <p>No {integration.name} accounts or MCP servers connected yet.</p>
                <Button
                  type="button"
                  variant="brand"
                  size="sm"
                  onClick={() => setMode("choose")}
                >
                  <Plus className="size-3.5" />
                  Connect Now
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {accounts.map((acc) => {
                  const isMcp = acc.externalAccountId.startsWith("mcp:")
                  return (
                    <div
                      key={acc.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5 text-sm"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{acc.displayName}</span>
                          {isMcp ? (
                            <Badge variant="brand">MCP Server</Badge>
                          ) : null}
                          <Badge
                            variant={
                              acc.status === "active" ? "success" : "warning"
                            }
                          >
                            {CONNECTION_STATUS_LABELS[acc.status]}
                          </Badge>
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {isMcp ? "Endpoint / Command: " : "ID: "}
                          {acc.externalAccountId}
                        </div>
                      </div>

                      {canManage ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={disconnectingId === acc.id}
                          onClick={() => handleDisconnect(acc.id)}
                        >
                          {disconnectingId === acc.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Trash2 className="size-3" />
                          )}
                          Disconnect
                        </Button>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
