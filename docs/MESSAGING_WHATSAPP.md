# Messaging & WhatsApp Marketing — Product Architecture

**Status:** M0–M4 shipped (catalog, WhatsApp + MSG91 SMS + Resend email, bulk send, automations, quiet hours, opt-out, entitlements, Messaging Specialist agent).  
**Fits:** Phase 4.5 / Phase 5 bridge — after social OAuth foundations, before full Ads Manager  
**Principle:** Same as the rest of Tangent — AI drafts, humans approve exact payloads, Integration Gateway owns tokens, no fake “connected” states.

**Shipped surfaces:** `/w/[org]/messaging` (Products · Audiences · Templates · Broadcasts · Automations · Settings), WhatsApp webhook `/api/integrations/whatsapp/webhook`, migrations `…00100_messaging` · `…00200_messaging_broadcasts` · `…00300_messaging_automations`, providers `whatsapp` · `msg91` · `resend`, Command Centre agent `messaging_specialist`.

---

## 1. What this module is

A **multi-product outbound messaging workspace** where a business can:

1. Keep a **product catalog** (multiple products/services under one org).
2. Ingest **customer / lead audiences** (CSV import, CRM-style lists, scraped/lead-gen pipelines).
3. Connect **Meta WhatsApp Business** (and later SMS / transactional channels).
4. Use or draft **message templates**, sync approval status with Meta.
5. **One-click bulk send** of an approved template to a selected audience (with human approval).
6. **Automate** sends (schedules, triggers) under the same approval rules.

This is **not** a WhatsApp chatbot / inbox product in v1. Inbound reply handling can come later as a thin “conversation log”; v1 is outbound marketing + utility messaging.

---

## 2. Why this is easy *relative to greenfield*

Tangent already has the hard pieces this module hangs on:

| Existing foundation | How Messaging uses it |
| --- | --- |
| `send_marketing_message` in Approval Engine | Exact payload hash + human approve before any send |
| Integration Gateway + Meta OAuth adapters | New `whatsapp` adapter; reuse `META_APP_ID` / `META_APP_SECRET` |
| Encrypted `integration_credentials` | WABA / phone-number tokens never reach the browser |
| Campaigns + channels (`whatsapp`, `email`) | Broadcasts can attach to a campaign |
| `productsAndServices` on business profile | Evolve into a first-class product catalog |
| BullMQ / Redis job design (Phase 4) | Bulk send + rate-limit workers |
| Entitlements / plans | Cap contacts, sends/month, WABA connections |

**Hard parts (not UI):** Meta Business Verification + WhatsApp Business Account (WABA) onboarding, template category rules, India TRAI / DPDP consent, and per-number quality rating / rate limits.

---

## 3. User journey (happy path)

```
Connect Meta WhatsApp
    → pick WABA + phone number
    → sync / draft templates (submit to Meta for approval)
Import or scrape → Contacts → Audience lists (tagged by product / segment)
Compose broadcast
    → choose product · audience · channel · template · variable mapping
    → preview sample renders
    → Submit for approval (send_marketing_message)
Owner/Admin approves exact payload
    → worker batches Graph API template sends
    → delivery / read / failure webhooks update message_events
Optional: save as Automation rule (schedule or trigger)
```

“One click” in the product means: **one click after approval** (or Owner auto-approve under an entitlement). We never silently blast scraped numbers.

---

## 4. Domain model

### 4.1 Products (first-class)

Today `business_profiles.products_and_services` is a string array. Messaging needs durable products:

```
products
  id, organization_id, name, description, sku?,
  category?, status (active|archived),
  brand_profile_id?, metadata jsonb
```

- Broadcasts and automations are optionally scoped to a product.
- Scraped leads can be tagged `interested_product_id`.
- Creative Studio / campaigns can later link to the same product ids.

Migration path: seed `products` from existing `products_and_services` strings on first visit; keep the array as a denormalized convenience until Brand/Business UI is updated.

### 4.2 Contacts & audiences

```
contacts
  id, organization_id,
  phone_e164, email?, name?,
  source (manual|csv|scrape|api|crm),
  consent_whatsapp (bool + timestamp + evidence),
  consent_sms, consent_email,
  attributes jsonb,          -- custom fields for template vars
  product_interest_ids uuid[],
  opted_out_at, blocked_at,
  created_at, updated_at

audiences
  id, organization_id, name, description,
  product_id?,               -- optional scope
  filter jsonb | static member list,
  estimated_size, refreshed_at

audience_members
  audience_id, contact_id
```

**Scraped data:** treat scrapers as an **ingestion source**, not a send button. Pipeline:

1. Scrape job / upload lands in `contact_import_batches` (raw rows + provenance).
2. Normalize phones to E.164 (India `+91…`), dedupe, flag invalid.
3. Require **consent state**: `unknown` | `opted_in` | `opted_out`. Marketing templates only go to `opted_in` (or explicit “utility / transactional” path with separate policy).
4. Human reviews the import batch → promote to `contacts`.

This keeps Tangent honest on DPDP / spam risk and protects Meta quality rating.

### 4.3 Templates

```
message_templates
  id, organization_id,
  channel (whatsapp|sms|email),
  product_id?,
  name, language,
  category (marketing|utility|authentication),   -- Meta categories
  body_components jsonb,     -- header/body/footer/buttons + variables
  status (draft|pending_meta|approved|rejected|paused),
  meta_template_id?, meta_namespace?,
  rejection_reason?,
  created_by, updated_at
```

**Create-in-Tangent vs Meta:**

| Mode | Behaviour |
| --- | --- |
| Draft in Tangent | UI builder (variables `{{1}}` / named), AI assist from Copywriter |
| Submit to Meta | Gateway calls Message Templates API; status polled / webhooked |
| Sync from Meta | Import already-approved templates for one-click use |

v1 ships **draft + submit + sync**. Full visual template designer can stay simple (structured form, not Canva). Media headers reuse Asset Library.

### 4.4 Broadcasts (bulk sends)

```
message_broadcasts
  id, organization_id, product_id?, campaign_id?,
  channel, template_id, audience_id,
  variable_mapping jsonb,
  scheduled_for?,
  status (draft|pending_approval|approved|queued|sending|completed|failed|cancelled),
  approval_request_id?,
  stats jsonb   -- queued/sent/delivered/read/failed/opted_out

message_events
  id, broadcast_id, contact_id,
  provider_message_id?,
  status (queued|sent|delivered|read|failed|undeliverable),
  error_code?, error_message?,
  cost_estimate_paise?,
  occurred_at
```

Approval payload (hashed) includes: `broadcastId`, `templateId` + Meta name/language, `audienceId` + **contact-id set hash** (or immutable snapshot id), channel, variable mapping, estimated recipient count, estimated cost. Editing the audience or template after approval supersedes the request (existing engine behaviour).

### 4.5 Automations

```
message_automations
  id, organization_id, product_id?,
  name, enabled,
  trigger (cron|event),
  trigger_config jsonb,   -- cron expr | event: lead_imported, form_submit, abandoned_cart…
  channel, template_id, audience_filter jsonb,
  require_approval_each_run bool,  -- default true for marketing
  last_run_at, next_run_at
```

v1 automations: **scheduled broadcasts** only.  
v1.1: event triggers via webhooks / n8n (already a planned connector).  
Marketing automations still create an approval request per run unless the org entitlement allows “pre-approved automation” with a spend/volume cap.

---

## 5. Meta WhatsApp integration

### 5.1 New provider

Add to `INTEGRATION_PROVIDERS`:

- `id: "whatsapp"`
- category: `social` (or new `messaging`)
- env: same `META_APP_ID`, `META_APP_SECRET` (+ optional `META_WHATSAPP_CONFIG_ID` for Embedded Signup)
- connectorPhase: **4** (alongside Instagram/Facebook)

### 5.2 Adapter capabilities (extend ProviderAdapter)

```
WhatsAppAdapter extends ProviderAdapter {
  listWabas(tokens)
  listPhoneNumbers(wabaId)
  listTemplates(wabaId)
  createTemplate(wabaId, draft)
  sendTemplateMessage({ phoneNumberId, to, template, components })
  // webhook verify + parse delivery statuses
}
```

Onboarding preference: **Meta Embedded Signup** (fastest for Indian SMBs) → store WABA id, phone number id, permanent token in encrypted credentials. Fallback: manual System User token paste for agencies.

### 5.3 Send path

```
approve(send_marketing_message)
  → assertExecutable(request, payload)
  → enqueue messaging_jobs (BullMQ), chunked (e.g. 50–100)
  → worker decrypts token, calls Graph API
  → respect quality rating / throughput
  → write message_events + audit_log
```

Webhooks: `POST /api/integrations/whatsapp/webhook` — verify Meta signature, update delivery/read/failures, handle user opt-out (`STOP`).

### 5.4 Template rules (product UX must encode)

- Marketing templates: **outside** 24h session window only via approved templates.
- Variables limited; no open-ended URLs in some categories.
- Quality rating drops → Meta throttles; UI must surface this and pause automations.
- Pricing is conversation-based (Meta bill to customer); Tangent shows estimates, never invoices Meta fees.

---

## 6. “Normal messages” (SMS / others)

| Channel | v1 | Notes |
| --- | --- | --- |
| WhatsApp Cloud API | ✅ | Primary India channel |
| SMS (DLT / Trai) | ⬜ Phase 5.5 | Need DLT-registered templates + Indian SMS aggregator (MSG91 / Kaleyra / Twilio) |
| Email | ⬜ later | Separate ESP; reuse audiences |
| WhatsApp session replies | ⬜ later | Free-form only inside 24h service window |

Architecture: same `message_templates` / `broadcasts` / approval type; only the adapter differs. Do **not** invent a parallel product surface per channel.

---

## 7. UI surfaces (app module)

Suggested nav: **Messaging** (or under Campaigns as “Outbound”).

| Screen | Purpose |
| --- | --- |
| Overview | Connection status, template health, recent broadcasts, quality rating |
| Products | CRUD multi-product catalog |
| Audiences | Lists, import CSV, scrape-batch review, consent filters |
| Templates | Draft builder, Meta sync, AI rewrite, approval status badges |
| Broadcasts | Compose → preview → submit approval → live progress |
| Automations | Schedules / triggers |
| Settings | WABA, phone number, default language, quiet hours, opt-out text |

Reuse: Integrations page for connect; Approvals inbox for `send_marketing_message`; Asset Library for template media; Command Centre agent (“Messaging Specialist”) drafts copy + suggests audiences later.

---

## 8. Schema / migrations (sketch)

New migration (e.g. `…_messaging.sql`):

- enums: `message_channel`, `template_status`, `broadcast_status`, `contact_source`, `consent_state`
- tables: `business_products`, `contacts`, `audiences`, `audience_members`, `contact_import_batches`, `message_templates`, `message_broadcasts`, `message_events`, `message_automations`
- RLS: org-scoped like campaigns/content
- entitlements: `messaging.contacts_max`, `messaging.sends_per_month`, `messaging.whatsapp_numbers`, `messaging.automations`

Extend `ExternalAccount.kind` with `"whatsapp_business" | "phone_number"`.

---

## 9. Compliance & safety (non-negotiable)

1. **No send without approval** (engine already models this).
2. **Consent gate** on marketing audiences; scrape ≠ consent.
3. **Opt-out** honored immediately; suppress across broadcasts.
4. **Quiet hours** configurable (India evening defaults).
5. **Audit** every approve/execute/webhook.
6. Honest UI when WABA unverified, template rejected, or quality limited.

---

## 10. Phased delivery

### Phase M0 — Foundations (1–2 weeks)
- `products` table + migrate from string array  
- `contacts` / `audiences` / CSV import + E.164 normalize  
- Messaging module shell (roadmap-accurate empty states)  
- Register `whatsapp` provider in Integrations UI  

### Phase M1 — Meta connect + templates (2–3 weeks)
- WhatsApp adapter + Embedded Signup (or token connect)  
- Sync templates; draft + submit template API  
- Template list UI with Meta status  

### Phase M2 — One-click bulk send (2 weeks)
- Broadcast composer + variable mapping + preview  
- Approval payload + BullMQ worker + webhooks  
- Progress / failure UI  

### Phase M3 — Automation + scrape ingest (2 weeks)
- Scheduled automations  
- Scrape/import batch review queue  
- Opt-out + quiet hours + entitlement caps  

### Phase M4 — Multi-channel ✅
- MSG91 SMS adapter (DLT Flow + plain SMS fallback)  
- Resend email adapter  
- Multi-channel templates / broadcasts / automations UI  
- Messaging Specialist agent in Command Centre  

**Effort reality:** M0–M2 is the “easy” path because gateway + approvals exist. Meta app review / Business Verification is the external critical path — start Meta Business verification **in parallel** with M0.

---

## 11. Acceptance criteria (MVP = end of M2)

- [ ] Org can connect a WhatsApp Business phone number via Integrations  
- [ ] Multiple products exist and can scope audiences/broadcasts  
- [ ] CSV leads import with consent flags; invalid phones rejected  
- [ ] Approved Meta templates appear in Tangent; drafts can be submitted  
- [ ] Broadcast → approval → send to N contacts with per-message status  
- [ ] Opted-out contacts never receive marketing sends  
- [ ] No tokens in browser; demo mode never claims a live WABA  

---

## 12. Open implementation notes (decided for v1)

| Topic | Decision |
| --- | --- |
| Channel priority | WhatsApp first; SMS/email share the same model later |
| Scraped data | Import + review + consent; not auto-send |
| Templates | Create/draft in Tangent + sync/submit to Meta |
| Products | Promote to first-class table |
| Automation | Schedules after M2; event triggers after |
| Chatbot / inbox | Out of scope for MVP |

---

## Related docs

- `docs/INTEGRATIONS.md` — gateway, OAuth, execution path  
- `docs/PRODUCT_OVERVIEW.md` — module list  
- `docs/DEVELOPMENT_ROADMAP.md` — phase ordering  
- `src/lib/approvals/engine.ts` — `send_marketing_message`  
- `src/lib/integrations/adapters.ts` — Meta Graph adapters to extend  
