# Integrations

All external platforms are reached through the **Integration Gateway** (`src/lib/integrations/gateway.ts`).
The frontend never calls provider APIs and never receives API keys, access tokens or refresh tokens.

## Current status (honest)

| Provider | Category | Credentials | Connector |
| --- | --- | --- | --- |
| OpenAI | AI | `OPENAI_API_KEY` | ✅ Used by agents (Responses API, structured outputs) |
| Anthropic | AI | `ANTHROPIC_API_KEY` | ✅ Used by agents (Messages API, structured outputs); automatic failover with OpenAI |
| Supabase | Platform | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ Auth, Postgres, Storage |
| Instagram, Facebook Pages | Social | `META_APP_ID`, `META_APP_SECRET` | ✅ OAuth (long-lived token) + approval-gated publishing (`lib/integrations/meta-publisher.ts`) |
| YouTube | Social | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Phase 4 |
| Meta Ads | Advertising | Meta app | Phase 5 |
| Google Ads | Advertising | Google OAuth + `GOOGLE_ADS_DEVELOPER_TOKEN` | Phase 5 |
| Google Search Console | Search | Google OAuth | Phase 5 |
| n8n | Automation | `N8N_BASE_URL`, `N8N_API_KEY` | Phase 5 |
| LinkedIn, TikTok | Social | client id/secret | Phase 6+ |
| Razorpay | Payments | key id/secret + webhook secret | Phase 6 |

The Integrations page computes status from server env: **Credentials set** (adapter live), **Credentials set · connector in Phase N**,
or **Not configured**. No provider is ever shown as "connected" until a real OAuth flow has stored a working token.

## Adapter contract

```ts
interface ProviderAdapter {
  id: string
  requiredScopes: string[]
  authorizationUrl({ state, redirectUri }): string
  exchangeCode({ code, redirectUri }): Promise<OAuthTokens>
  refresh(refreshToken): Promise<OAuthTokens>
  listAccounts(tokens): Promise<ExternalAccount[]>
  missingPermissions(tokens): Promise<string[]>
}
```

Capability interfaces (publishing, insights, ads) extend this per provider as phases ship. Adding a platform means
adding an adapter and registering it — the core app, approval engine and UI are unchanged.

## OAuth flow (Phase 4 design)

1. `GET /api/integrations/[provider]/connect` — requires `integrations.manage`; creates a signed, short-lived `state` bound to org + user; redirects to `authorizationUrl`.
2. `GET /api/integrations/[provider]/callback` — verifies `state`, exchanges the code server-side, checks `missingPermissions`, lists accounts, and stores:
   - `connected_accounts` row (metadata + scopes, no tokens)
   - `private.integration_credentials` row with tokens encrypted using AES-256-GCM (`INTEGRATION_ENCRYPTION_KEY`, versioned via `key_version`).
3. Missing scopes → account saved as `needs_reauth` with a clear UI state; nothing is simulated.

## Token management

- Tokens are decrypted only inside server jobs/handlers that need them.
- Refresh happens proactively before `token_expires_at`; failures set status `needs_reauth` and notify owners.
- Key rotation: new `key_version`, background re-encryption.

## Agent publishing (live)

```
Command Centre run → approval_request (exact social_post payload + hash, no tokens)
→ user presses Approve & publish (content.publish) → assertExecutable → approved→executing (compare-and-set)
→ decrypt token from private.integration_credentials → Meta Graph API → executed|failed
→ content_items (published|failed) + publishing_jobs (external_post_id / last_error) + audit log
```

- Instagram: `POST /{ig-user-id}/media` (public signed JPEG URL + caption) → poll `status_code` → `POST /{ig-user-id}/media_publish` → permalink.
- Facebook Pages: Page token via `GET /{page-id}?fields=access_token`, then `POST /{page-id}/photos` (or `/feed` for text).
- Meta errors keep Meta's message and map to `token_expired` (190), `permission_denied` (10/200–299), `rate_limited` (4/17/32/613).
- OAuth now exchanges the short-lived code token for a ~60-day token. Accounts connected before this change may hold a
  1–2 hour token: reconnect them once.
- Accounts saved as `needs_reauth` only because insights scopes are missing can still publish when the publish scope
  (`instagram_content_publish` / `pages_manage_posts`) was granted.
- Requires `SUPABASE_SERVICE_ROLE_KEY` (execution states, vault reads and publishing jobs are service-role writes) and the
  same `INTEGRATION_ENCRYPTION_KEY` that encrypted the tokens.
- Scheduling, ad launches and spend are not executed yet (approval cards say so).

## Execution path (publishing / ads)

```
agent draft → approval_request (exact payload + hash) → human approves → publishing_job / ad action
→ worker: assertExecutable(request, payload, spendLimit) → provider API → result + audit log
```

- Workers run on BullMQ + Redis (`REDIS_URL`) with retries, backoff and per-provider rate limits.
- Webhooks (`/api/integrations/[provider]/webhook`) verify signatures before processing.
- Sync jobs ingest insights into `analytics_events` with source, reporting window and `is_estimate`.

## Error handling

`IntegrationError` codes: `not_configured`, `permission_denied`, `rate_limited`, `token_expired`, `provider_error`.
Each maps to a specific UI state (connection required, re-authorise, retry later) — never a silent failure or fake success.

## Billing (Razorpay)

Razorpay handles Tangent subscriptions only. Verified webhooks update `subscriptions`; entitlements are read from
`plan_entitlements` (+ overrides). Advertising spend is billed directly by Meta/Google to the customer.
