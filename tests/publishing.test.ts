import { randomBytes } from "node:crypto"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CopyOutput } from "@/lib/ai/outputs"
import { hashPayload, type ApprovalRequest, type ApprovalStatus } from "@/lib/approvals/engine"
import type { WorkspaceRepository } from "@/lib/data/types"
import type { ConnectedAccountView } from "@/lib/domain/social"
import { resetServerEnvCache } from "@/lib/env/server"
import {
  accountReadiness,
  canonicalProvider,
  connectionsContextText,
  summarizeConnections,
} from "@/lib/integrations/connections"
import { encryptToken } from "@/lib/integrations/crypto"
import { publishFacebookPost, publishInstagramImage, resolveInstagramUserId, type FetchLike } from "@/lib/integrations/meta-publisher"
import { approveAndPublish, latestApprovalId } from "@/lib/publishing/executor"
import { captionFromVariant, socialPostPayloadSchema, type SocialPostPayload } from "@/lib/publishing/payload"
import { prepareExternalActions } from "@/lib/publishing/prepare"

const NOW = new Date("2026-11-12T10:00:00Z")

function account(overrides: Partial<ConnectedAccountView>): ConnectedAccountView {
  return {
    id: "acc-ig",
    provider: "instagram",
    externalAccountId: "17841400000000000",
    displayName: "@tectangle_",
    scopes: ["instagram_basic", "instagram_content_publish", "pages_show_list"],
    status: "active",
    tokenExpiresAt: null,
    lastSyncedAt: null,
    lastError: null,
    updatedAt: NOW.toISOString(),
    ...overrides,
  }
}

const IG = account({})
const FB = account({ id: "acc-fb", provider: "facebook", externalAccountId: "1029384756", displayName: "Tectangle Studio", scopes: ["pages_manage_posts"] })

const copy: CopyOutput = {
  brief: "",
  notes: [],
  variants: [
    { platform: "Instagram", format: "Post", headline: "Diwali drop", body: "Lights, colour, Tectangle.", callToAction: "Shop now", hashtags: ["Diwali", "#tectangle", "bad tag!"], suggestedDate: "" },
    { platform: "Facebook", format: "Post", headline: "Diwali drop", body: "Celebrate with us. Shop now", callToAction: "Shop now", hashtags: [], suggestedDate: "" },
  ],
}

describe("connection status for agents", () => {
  it("maps planner platform names and stored providers to one id", () => {
    expect(canonicalProvider("Instagram")).toBe("instagram")
    expect(canonicalProvider("IG")).toBe("instagram")
    expect(canonicalProvider("Facebook Page")).toBe("facebook")
    expect(canonicalProvider("meta")).toBe("meta_ads")
    expect(canonicalProvider("Meta Ads")).toBe("meta_ads")
  })

  it("treats accounts missing only insights scopes as able to publish", () => {
    const partial = account({ status: "needs_reauth", lastError: "Missing scopes: instagram_manage_insights" })
    expect(accountReadiness(partial, NOW)).toMatchObject({ usable: true })
    const noPublish = account({ status: "needs_reauth", scopes: ["instagram_basic"] })
    expect(accountReadiness(noPublish, NOW).usable).toBe(false)
  })

  it("flags expired tokens and MCP-only connections", () => {
    expect(accountReadiness(account({ tokenExpiresAt: "2026-11-01T00:00:00Z" }), NOW).usable).toBe(false)
    expect(accountReadiness(account({ externalAccountId: "mcp:sse:https://x" }), NOW).usable).toBe(false)
  })

  it("describes real connection status for the planner", () => {
    const text = connectionsContextText(summarizeConnections([IG, FB], NOW))
    expect(text).toContain("Instagram: @tectangle_ (ready)")
    expect(text).toContain("Facebook: Tectangle Studio (ready)")
    expect(connectionsContextText([])).toContain("No platforms are connected")
  })
})

describe("captions", () => {
  it("adds the CTA once and keeps only valid, unique hashtags", () => {
    expect(captionFromVariant(copy.variants[0]!)).toBe("Lights, colour, Tectangle.\n\nShop now\n\n#Diwali #tectangle")
    expect(captionFromVariant(copy.variants[1]!)).toBe("Celebrate with us. Shop now")
  })
})

describe("preparing external actions", () => {
  const image = { stepId: "tool-image", assetId: "asset-1", name: "Diwali", url: "https://x/y.jpg", prompt: "p", width: 1024, height: 1024, mimeType: "image/jpeg" }
  const base = {
    connections: summarizeConnections([IG, FB], NOW),
    copies: [copy],
    image,
    imageIssue: null,
    validationIssue: null,
    title: "Diwali post",
  }

  it("creates approval-ready payloads for connected Instagram and Facebook", () => {
    const prepared = prepareExternalActions({
      ...base,
      externalActions: [
        { actionType: "publish_post", platform: "Instagram", description: "" },
        { actionType: "publish_post", platform: "facebook", description: "" },
        { actionType: "publish_post", platform: "IG", description: "duplicate" },
      ],
    })
    expect(prepared).toHaveLength(2)
    expect(prepared.map((p) => p.action.state)).toEqual(["awaiting_approval", "awaiting_approval"])
    const ig = prepared[0]!.payload!
    expect(socialPostPayloadSchema.parse(ig)).toEqual(ig)
    expect(ig).toMatchObject({ platform: "instagram", connectedAccountId: "acc-ig", externalAccountId: "17841400000000000", imageAssetId: "asset-1" })
    expect(prepared[1]!.payload).toMatchObject({ platform: "facebook", connectedAccountId: "acc-fb", caption: "Celebrate with us. Shop now" })
  })

  it("explains why an action can't be prepared", () => {
    const prepared = prepareExternalActions({
      ...base,
      connections: summarizeConnections([IG], NOW),
      image: null,
      imageIssue: "Image generation isn't configured.",
      externalActions: [
        { actionType: "publish_post", platform: "Instagram", description: "" },
        { actionType: "publish_post", platform: "Facebook", description: "" },
        { actionType: "launch_ad_campaign", platform: "Instagram", description: "" },
      ],
    })
    expect(prepared[0]!.action).toMatchObject({ state: "blocked" })
    expect(prepared[0]!.action.reason).toContain("Image generation isn't configured")
    expect(prepared[1]!.action.state).toBe("connection_required")
    expect(prepared[2]!.action.state).toBe("unsupported")
    expect(prepared.every((p) => p.payload === null)).toBe(true)
  })

  it("links posts to the Creative Studio design when one was built", () => {
    const prepared = prepareExternalActions({
      ...base,
      creative: { projectId: "proj-1" },
      externalActions: [{ actionType: "publish_post", platform: "Instagram", description: "" }],
    })
    const payload = prepared[0]!.payload!
    expect(payload).toMatchObject({ creativeProjectId: "proj-1", designRendered: false })
    expect(socialPostPayloadSchema.parse(payload)).toEqual(payload)
    expect(prepared[0]!.action.preview?.creativeProjectId).toBe("proj-1")
  })

  it("lets a purely graphic design publish to Instagram without a photo", () => {
    const prepared = prepareExternalActions({
      ...base,
      image: null,
      imageIssue: null,
      creative: { projectId: "proj-2" },
      externalActions: [{ actionType: "publish_post", platform: "Instagram", description: "" }],
    })
    expect(prepared[0]!.action.state).toBe("awaiting_approval")
    expect(prepared[0]!.payload).toMatchObject({ imageAssetId: null, creativeProjectId: "proj-2", designRendered: false })
  })

  it("blocks publishing when brand validation failed", () => {
    const prepared = prepareExternalActions({ ...base, validationIssue: "Brand check failed", externalActions: [{ actionType: "publish_post", platform: "Facebook", description: "" }] })
    expect(prepared[0]!.action).toMatchObject({ state: "blocked", reason: "Brand check failed" })
  })
})

type Call = { url: string; body: URLSearchParams | null; method: string }

function fakeGraph(responses: Record<string, unknown>[]): { fetchImpl: FetchLike; calls: Call[] } {
  const calls: Call[] = []
  const queue = [...responses]
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? new URLSearchParams(init.body) : null })
    const next = queue.shift() ?? {}
    const status = (next as { __status?: number }).__status ?? 200
    return new Response(JSON.stringify(next), { status, headers: { "Content-Type": "application/json" } })
  }
  return { fetchImpl, calls }
}

describe("Meta Graph publishing", () => {
  it("publishes an Instagram image via container → status → publish", async () => {
    const { fetchImpl, calls } = fakeGraph([
      { id: "container-1" },
      { status_code: "IN_PROGRESS" },
      { status_code: "FINISHED" },
      { id: "media-9" },
      { permalink: "https://www.instagram.com/p/abc/" },
    ])
    const result = await publishInstagramImage({ igUserId: "1784", accessToken: "tok", imageUrl: "https://img/x.jpg", caption: "Hi", fetchImpl, pollIntervalMs: 0 })
    expect(result).toEqual({ externalPostId: "media-9", permalink: "https://www.instagram.com/p/abc/" })
    expect(calls[0]!.url).toContain("/1784/media")
    expect(calls[0]!.body?.get("image_url")).toBe("https://img/x.jpg")
    // POST bodies carry the token, never the URL.
    expect(calls[0]!.url).not.toContain("tok")
    expect(calls[3]!.body?.get("creation_id")).toBe("container-1")
  })

  it("resolves an Instagram handle to the numeric account id", async () => {
    const { fetchImpl, calls } = fakeGraph([
      { data: [{ instagram_business_account: { id: "999", username: "other" } }, { instagram_business_account: { id: "17841", username: "tectangle_" } }] },
    ])
    await expect(resolveInstagramUserId({ idOrHandle: "@tectangle_", accessToken: "t", fetchImpl })).resolves.toBe("17841")
    expect(calls[0]!.url).toContain("/me/accounts")
    await expect(resolveInstagramUserId({ idOrHandle: "17841400", accessToken: "t", fetchImpl })).resolves.toBe("17841400")
  })

  it("uses graph.instagram.com for Instagram Login tokens", async () => {
    const { fetchImpl, calls } = fakeGraph([
      { user_id: "17841555", username: "tectangle_" },
      { id: "c-1" },
      { status_code: "FINISHED" },
      { id: "m-1" },
      { permalink: "https://instagram.com/p/x" },
    ])
    const igUserId = await resolveInstagramUserId({ idOrHandle: "tectangle_", accessToken: "IGAAtest", fetchImpl })
    expect(igUserId).toBe("17841555")
    await publishInstagramImage({ igUserId, accessToken: "IGAAtest", imageUrl: "https://img/x.jpg", caption: "Hi", fetchImpl, pollIntervalMs: 0 })
    expect(calls.every((c) => c.url.startsWith("https://graph.instagram.com/"))).toBe(true)
    expect(calls[1]!.url).toContain("/17841555/media")
  })

  it("rejects an Instagram Login token for a different account", async () => {
    const { fetchImpl } = fakeGraph([{ user_id: "1", username: "someone_else" }])
    await expect(resolveInstagramUserId({ idOrHandle: "tectangle_", accessToken: "IGAAtest", fetchImpl })).rejects.toThrow(/@someone_else/)
  })

  it("explains when the handle isn't a linked professional account", async () => {
    const { fetchImpl } = fakeGraph([{ data: [] }, {}])
    await expect(resolveInstagramUserId({ idOrHandle: "tectangle_", accessToken: "t", fetchImpl })).rejects.toThrow(/Business or Creator/)
  })

  it("surfaces Meta's error message and maps expired tokens", async () => {
    const { fetchImpl } = fakeGraph([{ __status: 400, error: { message: "Error validating access token", code: 190 } }])
    await expect(publishInstagramImage({ igUserId: "1", accessToken: "t", imageUrl: "u", caption: "c", fetchImpl })).rejects.toMatchObject({
      code: "token_expired",
      message: expect.stringContaining("Error validating access token"),
    })
  })

  it("posts a photo to a Facebook Page with the Page token", async () => {
    const { fetchImpl, calls } = fakeGraph([{ access_token: "page-token" }, { id: "photo-1", post_id: "1029_55" }])
    const result = await publishFacebookPost({ pageId: "1029", accessToken: "user-token", caption: "Hello", imageUrl: "https://img/x.jpg", fetchImpl })
    expect(result).toEqual({ externalPostId: "1029_55", permalink: "https://www.facebook.com/1029_55" })
    expect(calls[1]!.url).toContain("/1029/photos")
    expect(calls[1]!.body?.get("access_token")).toBe("page-token")
    expect(calls[1]!.body?.get("message")).toBe("Hello")
  })

  it("accepts a Page token for the same Page", async () => {
    const { fetchImpl, calls } = fakeGraph([
      { __status: 400, error: { message: "(#100) Tried accessing nonexisting field (access_token)", code: 100 } },
      { id: "1029" },
      { id: "post-1" },
    ])
    await publishFacebookPost({ pageId: "1029", accessToken: "page-token", caption: "Hi", imageUrl: null, fetchImpl })
    expect(calls[2]!.body?.get("access_token")).toBe("page-token")
  })

  it("refuses to post when the token can't act as the Page", async () => {
    const { fetchImpl, calls } = fakeGraph([{}, { id: "someone-else" }])
    await expect(
      publishFacebookPost({ pageId: "1029", accessToken: "user-token", caption: "Hi", imageUrl: "https://img/x.jpg", fetchImpl })
    ).rejects.toMatchObject({ code: "permission_denied", message: expect.stringContaining("can't post as Page 1029") })
    expect(calls).toHaveLength(2)
  })
})

describe("approve & publish executor", () => {
  const key = randomBytes(32).toString("base64")
  const payload: SocialPostPayload = {
    kind: "social_post",
    platform: "facebook",
    caption: "Hello",
    imageAssetId: null,
    connectedAccountId: "acc-fb",
    accountName: "Tectangle Studio",
    externalAccountId: "1029",
    title: "Diwali",
  }

  beforeEach(() => {
    process.env.INTEGRATION_ENCRYPTION_KEY = key
    resetServerEnvCache()
  })
  afterEach(() => {
    delete process.env.INTEGRATION_ENCRYPTION_KEY
    resetServerEnvCache()
  })

  async function fakeRepository(initial: ApprovalStatus, storedPayload: Record<string, unknown> = payload) {
    const state = {
      status: initial,
      hash: await hashPayload(payload),
      published: [] as string[],
      audit: [] as string[],
    }
    const request = (): ApprovalRequest<Record<string, unknown>> => ({
      id: "appr-1",
      version: 1,
      previousVersionId: null,
      actionType: "publish_post",
      connectedAccountId: "acc-fb",
      payload: storedPayload,
      payloadHash: state.hash,
      financialImpact: null,
      requestedByAgent: "social_media_manager",
      status: state.status,
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
    })
    const repository = {
      getApprovalRequest: async () => request(),
      decideApproval: async () => {
        state.status = "approved"
        return {} as never
      },
      setApprovalExecutionStatus: async (_id: string, from: ApprovalStatus, to: ApprovalStatus) => {
        if (state.status !== from) return false
        state.status = to
        return true
      },
      listConnectedAccounts: async () => [FB],
      getConnectedAccountCredential: async () => ({ accessTokenCiphertext: encryptToken("user-token", key), refreshTokenCiphertext: null, keyVersion: 1 }),
      resolveAssetUrls: async () => ({}),
      recordPublishing: async (input: { status: string }) => {
        state.published.push(input.status)
      },
      recordAudit: async (entry: { action: string }) => {
        state.audit.push(entry.action)
      },
      listPublishingJobs: async () => [],
    } as unknown as WorkspaceRepository
    return { repository, state }
  }

  it("follows retried approvals to the newest version", async () => {
    const statuses: Record<string, ApprovalStatus> = { v1: "superseded", v2: "superseded", v3: "pending" }
    const next: Record<string, string> = { v1: "v2", v2: "v3" }
    const repository = {
      getApprovalRequest: async (id: string) => ({ id, status: statuses[id] }),
      getNextApprovalVersionId: async (id: string) => next[id] ?? null,
    } as unknown as WorkspaceRepository
    await expect(latestApprovalId(repository, "v1")).resolves.toBe("v3")
    await expect(latestApprovalId(repository, "v3")).resolves.toBe("v3")
  })

  it("approves, decrypts the stored token server-side and publishes once", async () => {
    const { repository, state } = await fakeRepository("pending")
    const { fetchImpl, calls } = fakeGraph([{ access_token: "page-token" }, { id: "1029_77" }])
    const result = await approveAndPublish({ repository, approvalId: "appr-1", actorId: "user-1", fetchImpl })
    expect(result).toMatchObject({ approvalStatus: "executed", externalPostId: "1029_77", permalink: "https://www.facebook.com/1029_77" })
    expect(calls[0]!.url).toContain("access_token=user-token")
    expect(state.status).toBe("executed")
    expect(state.published).toEqual(["succeeded"])
    expect(state.audit).toEqual(["approval.approve", "publishing.succeeded"])

    // A second click can't publish again.
    const again = await approveAndPublish({ repository, approvalId: "appr-1", actorId: "user-1", fetchImpl })
    expect(again.approvalStatus).toBe("executed")
    expect(calls).toHaveLength(2)
  })

  it("won't publish a design's background photo in place of the rendered design", async () => {
    const { repository, state } = await fakeRepository("pending", { ...payload, creativeProjectId: "proj-1", designRendered: false })
    const { fetchImpl, calls } = fakeGraph([])
    const result = await approveAndPublish({ repository, approvalId: "appr-1", actorId: "user-1", fetchImpl })
    expect(result.error).toMatch(/Creative Studio design/)
    expect(state.status).toBe("pending")
    expect(calls).toHaveLength(0)
  })

  it("records Meta rejections as failed with the reason", async () => {
    const { repository, state } = await fakeRepository("approved")
    const { fetchImpl } = fakeGraph([{ access_token: "page-token" }, { __status: 403, error: { message: "(#200) Requires pages_manage_posts", code: 200 } }])
    const result = await approveAndPublish({ repository, approvalId: "appr-1", actorId: "user-1", fetchImpl })
    expect(result.approvalStatus).toBe("failed")
    expect(result.error).toContain("Requires pages_manage_posts")
    expect(state.status).toBe("failed")
    expect(state.published).toEqual(["failed"])
  })

  it("refuses to publish a payload that differs from what was approved", async () => {
    const { repository, state } = await fakeRepository("approved", { ...payload, caption: "Tampered" })
    const { fetchImpl, calls } = fakeGraph([])
    await expect(approveAndPublish({ repository, approvalId: "appr-1", actorId: "user-1", fetchImpl })).rejects.toMatchObject({ code: "payload_mismatch" })
    expect(calls).toHaveLength(0)
    expect(state.status).toBe("approved")
  })

  it("never publishes rejected requests", async () => {
    const { repository } = await fakeRepository("rejected")
    const { fetchImpl, calls } = fakeGraph([])
    await expect(approveAndPublish({ repository, approvalId: "appr-1", actorId: "user-1", fetchImpl })).rejects.toMatchObject({ code: "not_approved" })
    expect(calls).toHaveLength(0)
  })
})
