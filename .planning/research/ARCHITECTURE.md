# Architecture Patterns: AI-Powered Subscription Detection

**Domain:** Mobile app — Gmail + Plaid subscription scanner with LLM extraction
**Researched:** 2026-04-04
**Overall confidence:** MEDIUM (external tool access was unavailable; findings draw from training data through August 2025 — flag items marked LOW for live verification before implementation)

---

## 1. Gmail API Email Scanning

### Scope Selection

| Scope | Classification | Use When |
|-------|---------------|----------|
| `https://www.googleapis.com/auth/gmail.readonly` | Restricted | Full read access to all messages and metadata — requires Google security review for production |
| `https://www.googleapis.com/auth/gmail.metadata` | Restricted | Headers/metadata only (Subject, From, Date) — no body access |
| `https://www.googleapis.com/auth/gmail.labels` | Non-sensitive | Label management only — useless alone |

**Recommendation:** Request `gmail.readonly`. It is the minimum scope that gives access to message bodies needed for LLM extraction. The `gmail.metadata` scope is insufficient because subscription amounts and dates are usually in the body, not headers.

**Consequence for production:** `gmail.readonly` is a restricted scope. You must pass Google's OAuth app verification and security assessment before publishing to the App Store. Plan 4-8 weeks for this review. Build the app first, submit for review when approaching launch. [MEDIUM confidence — verification timeline from community reports, not official SLA]

### Batch vs Streaming

**Use batch scanning for initial onboarding, webhook/push for ongoing detection.**

**Initial scan (batch approach):**

```
1. messages.list with q="from:receipt OR from:billing OR from:invoice OR from:subscription OR from:noreply" maxResults=500
2. Paginate with pageToken until exhausted
3. Use batchGet (up to 100 message IDs per request) to fetch full messages
4. Decode base64url body parts
5. Pass bodies to LLM extraction pipeline
```

**Ongoing detection (push/watch approach):**

```
1. users.watch — subscribe to Gmail push notifications via Pub/Sub topic
2. Google publishes historyId change events to your Cloud Pub/Sub topic
3. Your backend calls users.history.list with startHistoryId to get new messages since last check
4. Filter by RECEIVE type, process only new messages
5. Watch subscription expires every 7 days — renew with another users.watch call
```

The watch + history approach is critical for ongoing detection without polling. Do not poll messages.list on a timer — it wastes quota and misses messages.

### Rate Limits

| Limit | Value | Notes |
|-------|-------|-------|
| Per-user quota | 250 units/second | Each API call costs 1-5 units depending on method |
| messages.list | 5 units | Per call |
| messages.get | 5 units | Per call |
| batchGet | 1 unit per message | More efficient than individual get calls |
| Daily quota | 1,000,000,000 units | Shared across all users of your app |

[MEDIUM confidence — these numbers are from 2024 documentation; verify at developers.google.com/gmail/api/reference/quota before implementation]

**Practical implication:** For a user with 2 years of email and 500 subscription-related messages, the initial scan costs roughly 5 (list) + 5 × 5 pages (pagination) + 500 (batchGet) ≈ 530 units. Well within per-user quota. Throttle to ~50 requests/second to stay safe.

### Email Filtering Strategy

Use Gmail search operators in the `q` parameter to pre-filter before LLM processing. This reduces token costs significantly.

```
q: "subject:(receipt OR invoice OR payment OR subscription OR renewal OR charged OR billing) newer_than:2y"
```

Combine with sender heuristics: most subscription receipts come from domains like `billing@`, `noreply@`, `receipts@`, `invoices@`, `payments@`. You can filter further with:

```
q: "from:(billing OR receipts OR invoice OR payment OR noreply) subject:(receipt OR payment OR subscription)"
```

**Do not** try to enumerate every subscription service sender — the list is unbounded. Use semantic filtering and let the LLM confirm.

### Message Body Decoding

Gmail returns message bodies as base64url-encoded strings in `payload.parts[].body.data`. Emails can be:

- `text/plain` — simple to decode, preferred for LLM
- `text/html` — must strip HTML tags before passing to LLM
- `multipart/alternative` — prefer `text/plain` part; fall back to `text/html`
- `multipart/mixed` — recurse into parts array

Always prefer `text/plain` over `text/html` when both exist. Strip HTML with a library like `html-to-text` (Node) or `bleach` (Python). Do not pass raw HTML to the LLM — it wastes tokens and degrades extraction quality.

---

## 2. Plaid Transactions API — Recurring Charge Detection

### Relevant Endpoint and Fields

**Primary endpoint:** `POST /transactions/sync` (preferred over the older `/transactions/get`)

`/transactions/sync` uses a cursor-based approach: first call returns all historical transactions + a `next_cursor`; subsequent calls return only new/modified/removed transactions since the last cursor. This is the correct pattern for ongoing detection.

**Key fields for subscription detection:**

| Field | Type | Why It Matters |
|-------|------|---------------|
| `transaction_id` | string | Stable identifier |
| `name` | string | Merchant name as reported by bank — often noisy (e.g., "NETFLIX.COM 866-579-7172") |
| `merchant_name` | string | Plaid-cleaned merchant name — more reliable than `name` |
| `amount` | float | Positive = debit, negative = credit (refund) |
| `date` | string (YYYY-MM-DD) | Transaction date |
| `authorized_date` | string | When authorized — often more accurate than `date` |
| `category` | string[] | Plaid's category hierarchy — use as signal, not sole classifier |
| `personal_finance_category` | object | Newer, more granular taxonomy (primary + detailed) |
| `recurring` | object | Available if you use the `/transactions/recurring` endpoint |
| `payment_channel` | string | "online", "in store", "other" — subscriptions are always "online" |
| `pending` | boolean | Exclude pending transactions from recurring analysis |

**`personal_finance_category` for subscriptions:**

```
primary: "GENERAL_SERVICES"
detailed: "GENERAL_SERVICES_SUBSCRIPTION" 
```

or

```
primary: "ENTERTAINMENT"
detailed: "ENTERTAINMENT_STREAMING_SERVICES"
```

[MEDIUM confidence — Plaid updates category taxonomies; verify current values against Plaid's category reference]

### Dedicated Recurring Endpoint

Plaid has a `/transactions/recurring` endpoint that directly identifies recurring streams. It returns `RecurringTransactionStream` objects with:

- `stream_id` — stable identifier for the recurring stream
- `merchant_name` — cleaned name
- `description` — raw description
- `category` — Plaid category
- `frequency` — `WEEKLY`, `BIWEEKLY`, `SEMI_MONTHLY`, `MONTHLY`, `ANNUALLY`, `IRREGULAR`, `UNKNOWN`
- `average_amount.amount` — average charge amount
- `last_amount.amount` — most recent charge
- `last_date` — date of last transaction in stream
- `is_active` — whether the stream is still active
- `status` — `MATURE` (enough data), `EARLY_DETECTION` (2-3 occurrences), `TOMBSTONED` (cancelled)

**Recommendation:** Use `/transactions/recurring` as the primary detection signal for bank-sourced subscriptions. This is higher-confidence than rolling your own recurrence detection. Use `status: MATURE` transactions as HIGH confidence, `EARLY_DETECTION` as MEDIUM, and run your own LLM analysis on `IRREGULAR` streams to classify edge cases.

[MEDIUM confidence — `/transactions/recurring` endpoint behavior verified through August 2025 Plaid docs; confirm it remains available in current Plaid pricing tiers]

### Rolling Your Own Recurrence Detection (Fallback)

If `/transactions/recurring` is unavailable or insufficient, detect recurrence by:

1. Group transactions by `merchant_name` (or normalized `name` if `merchant_name` is null)
2. For each merchant, collect all `amount` values
3. Check amount stability: `stddev(amounts) / mean(amounts) < 0.05` = fixed price subscription
4. Compute gaps between `date` values in days
5. Classify gaps: 28-32 days = monthly, 6-8 days = weekly, 360-370 days = annual
6. Require minimum 2 occurrences for `EARLY_DETECTION`, 3+ for `MATURE`

---

## 3. Prompt Engineering for Subscription Extraction

### Extraction Target Schema

Define the output schema before writing prompts. The LLM should return structured JSON:

```typescript
interface SubscriptionExtraction {
  is_subscription: boolean;
  confidence: number;           // 0.0 - 1.0
  service_name: string | null;
  amount: number | null;
  currency: string | null;      // ISO 4217, e.g. "USD"
  billing_frequency: "weekly" | "monthly" | "quarterly" | "annual" | "unknown" | null;
  next_billing_date: string | null;  // ISO 8601
  last_billing_date: string | null;
  trial_detected: boolean;
  cancellation_url: string | null;
  category: string | null;       // e.g. "streaming", "software", "news"
  raw_amount_text: string | null; // verbatim from email, for audit
}
```

### System Prompt Pattern

```
You are a subscription detection assistant. Your job is to analyze email content and determine whether it represents a recurring subscription charge or renewal.

Extract structured data from the email. Return ONLY valid JSON matching the schema provided. Do not explain your reasoning.

Rules:
- Set is_subscription=false for one-time purchases, order confirmations for physical goods, and marketing emails
- Set is_subscription=true for: recurring billing notices, subscription renewals, trial start/end notices, annual plan renewals
- confidence reflects your certainty that this is a recurring subscription (not a one-time charge)
- billing_frequency must be inferred from the email text or subject — do not guess
- If a field cannot be determined from the email, set it to null
- currency defaults to "USD" if not specified and context suggests US billing
- Extract cancellation_url only if explicitly present in the email body
```

### User Prompt Pattern

```
Analyze this email and extract subscription data.

Subject: {subject}
From: {from_address}
Date: {received_date}
Body:
---
{body_plain_text_truncated_to_2000_chars}
---

Return JSON only, no explanation.
```

### Key Prompt Engineering Decisions

**Truncate body to 2,000-3,000 characters.** Subscription receipts have all relevant information in the first ~500 words. Sending full email bodies (sometimes 10k+ tokens with HTML artifacts) multiplies cost without improving accuracy.

**Two-pass approach for ambiguous cases.** Run a cheap first-pass classifier (GPT-4o-mini or Claude Haiku) with a binary `is_subscription` prompt. Only route `true` results to the expensive extraction model. This reduces costs by ~60-70% assuming ~30% of filtered emails are actual subscriptions.

**Use JSON mode / structured output.** Both OpenAI (response_format: json_object) and Anthropic (tool use with schema) support constrained JSON output. Always use this — it eliminates parsing failures.

**Model recommendation:**
- Claude Haiku 3.5 or GPT-4o-mini for first-pass classification
- Claude Sonnet 3.7 or GPT-4o for full extraction on confirmed subscriptions
- Expect ~$0.002-0.005 per email for the full two-pass pipeline at current pricing [LOW confidence — pricing changes frequently; verify at time of build]

### Handling HTML Emails

Strip HTML before passing to LLM. Keep the text content but preserve structure:

```python
# Pseudo-code
from html_to_text import html2text
plain = html2text(html_body)
plain = re.sub(r'\n{3,}', '\n\n', plain)  # collapse excessive whitespace
plain = plain[:3000]  # truncate
```

Never pass raw HTML — `<td>`, `<span>`, and inline styles consume tokens without adding signal.

---

## 4. False Positive Handling and Confidence Scoring

### Multi-Signal Confidence Architecture

Do not rely on a single signal. Compute a composite confidence score from multiple independent signals:

```
confidence_final = weighted_average([
  llm_confidence,         # weight: 0.40
  plaid_match_bonus,      # weight: 0.25  (0 or 1 — did Plaid also detect this?)
  email_sender_signal,    # weight: 0.20  (known subscription sender domain)
  frequency_signal,       # weight: 0.15  (did we see this amount before in bank data?)
])
```

**Thresholds:**

| Score | Action | UI Label |
|-------|--------|---------|
| >= 0.85 | Auto-confirm, show in subscription list | "Detected" |
| 0.60 - 0.84 | Show to user for confirmation | "Likely subscription" |
| 0.40 - 0.59 | Queue for manual review | "Possible subscription" |
| < 0.40 | Discard | Not shown |

### Known Sender Allowlist

Maintain a seed list of known subscription sender domains that boost `email_sender_signal`:

- `billing@netflix.com`, `billing@spotify.com`, `no-reply@accounts.google.com` (Google One), etc.

This is a booster, not a gatekeeper — the LLM handles unknown services.

### Cross-Signal Deduplication

A single subscription generates both a Gmail receipt AND a Plaid transaction. Merge them into one subscription record:

```
Merge condition:
  abs(email_amount - plaid_amount) < 0.01 AND
  merchant_name_similarity(email_service_name, plaid_merchant_name) > 0.8 AND
  abs(email_date - plaid_date) <= 3 days
```

Use fuzzy string matching (e.g., Levenshtein or trigram similarity) for merchant name comparison — "Netflix" vs "NETFLIX.COM" vs "Netflix, Inc." must match.

When both signals exist, set `source: "email+bank"` and boost confidence to min(0.95, combined_score). If only one source exists, flag accordingly.

### Feedback Loop for Improving Accuracy

Store user confirmations and rejections. For each subscription the user explicitly marks as "not a subscription":
- Log the `(service_name, email_from, amount)` tuple
- Add to a user-level denylist
- After 3+ users reject the same sender, add to a global denylist and adjust LLM prompt

This is the primary long-term accuracy improvement mechanism. Build the feedback schema from day one.

---

## 5. Supabase Schema Design

### Core Tables

```sql
-- Users (managed by Supabase Auth)
-- auth.users table exists automatically

-- Extended user profile
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  onboarding_completed_at timestamptz,
  notification_preferences jsonb default '{}'::jsonb
);

-- OAuth integrations (Gmail, future sources)
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,                    -- 'gmail', 'plaid'
  provider_account_id text,                  -- Gmail: email address; Plaid: item_id
  access_token text,                         -- encrypted at rest (use Supabase Vault)
  refresh_token text,                        -- encrypted at rest
  token_expires_at timestamptz,
  scopes text[],                             -- OAuth scopes granted
  status text not null default 'active',     -- 'active', 'expired', 'revoked', 'error'
  last_synced_at timestamptz,
  sync_cursor text,                          -- Gmail: historyId; Plaid: transactions cursor
  metadata jsonb default '{}'::jsonb,        -- provider-specific extras
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  unique(user_id, provider, provider_account_id)
);

-- Detected subscriptions (canonical record)
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  service_name text not null,
  normalized_name text,                      -- lowercased, deduped key
  amount numeric(10, 2),
  currency text default 'USD',
  billing_frequency text,                    -- 'weekly','monthly','quarterly','annual','unknown'
  next_billing_date date,
  last_billing_date date,
  category text,                             -- 'streaming','software','news','fitness', etc.
  status text not null default 'active',     -- 'active','cancelled','paused','unknown'
  cancellation_url text,
  confidence numeric(4, 3),                  -- 0.000 to 1.000
  source text not null,                      -- 'email','bank','email+bank','manual'
  confirmed_by_user boolean,                 -- null=unreviewed, true=confirmed, false=rejected
  confirmed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  -- Prevent duplicate subscriptions for same user+service
  unique(user_id, normalized_name)
);

-- Raw email evidence records
create table public.email_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  gmail_message_id text not null,
  gmail_thread_id text,
  received_at timestamptz,
  subject text,
  from_address text,
  extracted_data jsonb,                      -- full LLM extraction result
  llm_confidence numeric(4, 3),
  llm_model text,                            -- 'claude-haiku-3-5', 'gpt-4o-mini', etc.
  processing_status text default 'pending',  -- 'pending','processed','failed','skipped'
  created_at timestamptz default now(),
  
  unique(user_id, gmail_message_id)
);

-- Raw bank transaction evidence
create table public.transaction_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  plaid_transaction_id text not null,
  plaid_stream_id text,                      -- from /transactions/recurring
  merchant_name text,
  amount numeric(10, 2),
  transaction_date date,
  plaid_category text[],
  personal_finance_category jsonb,
  plaid_frequency text,                      -- from recurring stream
  plaid_status text,                         -- 'MATURE','EARLY_DETECTION','TOMBSTONED'
  created_at timestamptz default now(),
  
  unique(user_id, plaid_transaction_id)
);

-- User feedback for improving accuracy
create table public.detection_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete cascade,
  action text not null,                      -- 'confirmed','rejected','edited'
  previous_data jsonb,                       -- snapshot before edit
  new_data jsonb,                            -- what user changed it to
  created_at timestamptz default now()
);

-- Background job queue (for Supabase Edge Function triggers)
create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  integration_id uuid references public.integrations(id) on delete cascade,
  job_type text not null,                    -- 'initial_scan','incremental_sync','plaid_sync'
  status text not null default 'pending',    -- 'pending','running','completed','failed'
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  metadata jsonb default '{}'::jsonb,        -- e.g., {messages_processed: 42}
  created_at timestamptz default now()
);
```

### Row-Level Security

Enable RLS on every table. Users can only read/write their own data:

```sql
alter table public.subscriptions enable row level security;

create policy "Users can manage their own subscriptions"
  on public.subscriptions
  for all
  using (auth.uid() = user_id);
```

Apply this pattern to all tables. Never expose data across users.

### Token Storage

Store OAuth tokens (Gmail `access_token`, `refresh_token`) and Plaid `access_token` using **Supabase Vault** (pg_vault extension). Do not store plaintext tokens in regular columns:

```sql
-- Store token
select vault.create_secret('gmail_access_token_for_user_xyz', 'ya29.a0AfB...');

-- Retrieve token (in Edge Function)
select decrypted_secret from vault.decrypted_secrets where name = 'gmail_access_token_for_user_xyz';
```

Or use Supabase's built-in encryption column extension (`pgsodium`) to encrypt the `access_token` and `refresh_token` columns at the database level. This is required for App Store compliance and any financial data handling.

[MEDIUM confidence — Supabase Vault API is stable as of mid-2025; verify current Vault API with Supabase docs]

### Indexes

```sql
-- Frequent query patterns
create index idx_subscriptions_user_status on public.subscriptions(user_id, status);
create index idx_email_evidence_user_status on public.email_evidence(user_id, processing_status);
create index idx_transaction_evidence_user on public.transaction_evidence(user_id, transaction_date);
create index idx_sync_jobs_pending on public.sync_jobs(status, created_at) where status = 'pending';
create index idx_integrations_user on public.integrations(user_id, provider, status);
```

---

## 6. Background Job Patterns for Ongoing Detection

### Architecture Overview

```
Mobile App
    |
    | (trigger on foreground / push notification)
    v
Supabase Edge Function (Deno)
    |
    |-- Gmail watch webhook receiver
    |-- Plaid webhook receiver  
    |-- Scheduled cron (daily fallback)
    v
Job Queue (sync_jobs table)
    |
    v
Processing Edge Function
    |
    |-- Gmail: history.list -> fetch new messages -> LLM extraction
    |-- Plaid: transactions/sync -> recurring detection -> merge
    v
subscriptions table (upsert)
    |
    v
Push notification to mobile app (Expo Push / APNs / FCM)
```

### Gmail Push Notifications (Recommended Primary Path)

```
1. On user connecting Gmail:
   a. Call Gmail users.watch with topic: your Cloud Pub/Sub topic
   b. Store returned historyId in integrations.sync_cursor
   c. Schedule a daily cron to renew the watch (expires in 7 days)

2. When Gmail pushes a notification to your Pub/Sub topic:
   a. Pub/Sub delivers to your webhook endpoint (Supabase Edge Function)
   b. Decode the notification: {emailAddress, historyId}
   c. Call users.history.list?startHistoryId={stored_cursor}&historyTypes=messageAdded
   d. Filter messagesAdded events
   e. Fetch message bodies
   f. Run LLM extraction pipeline
   g. Update integrations.sync_cursor to new historyId

3. Watch renewal:
   a. Supabase pg_cron job runs daily
   b. For each active Gmail integration: call users.watch again
   c. Update historyId cursor
```

**Cloud Pub/Sub setup:** You need a Google Cloud project with a Pub/Sub topic and a push subscription pointing to your Edge Function URL. This is a one-time infrastructure setup, not per-user.

### Plaid Webhooks (Recommended Primary Path)

```
1. Register webhook URL when creating Plaid Link item:
   webhook: "https://your-project.supabase.co/functions/v1/plaid-webhook"

2. Plaid fires TRANSACTIONS_SYNC_UPDATES_AVAILABLE webhook when new transactions arrive
   Payload: {webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE", item_id: "..."}

3. On webhook receipt:
   a. Look up integration by item_id
   b. Call /transactions/sync with stored cursor
   c. Process added transactions
   d. Call /transactions/recurring to refresh recurring streams
   e. Merge with existing subscriptions
   f. Update cursor in integrations.sync_cursor

4. Also handle: TRANSACTIONS_REMOVED (user deleted transaction), DEFAULT_UPDATE (historical refresh)
```

### Scheduled Fallback (Defense in Depth)

Use Supabase's pg_cron extension as a fallback for missed webhooks:

```sql
-- Run daily at 2am UTC for all active integrations
select cron.schedule(
  'daily-subscription-sync',
  '0 2 * * *',
  $$
    insert into public.sync_jobs (user_id, integration_id, job_type)
    select user_id, id, 'incremental_sync'
    from public.integrations
    where status = 'active'
      and last_synced_at < now() - interval '23 hours'
  $$
);
```

A separate Edge Function polls `sync_jobs` where `status = 'pending'` and processes them. This handles webhook delivery failures and users who disconnect/reconnect.

### Initial Scan Strategy

The initial Gmail scan (onboarding) is the most expensive operation. Structure it to avoid timeouts:

```
1. User connects Gmail in app
2. App calls Edge Function: POST /functions/v1/start-initial-scan
3. Edge Function creates sync_job with type='initial_scan'
4. Returns immediately with job_id (do not wait)
5. A separate worker Edge Function picks up the job:
   a. Fetch message IDs in pages of 100 (batches)
   b. For each batch: fetch bodies -> LLM extraction -> upsert
   c. Update sync_job.metadata with progress
6. App polls GET /functions/v1/scan-status?job_id=... for progress
7. On completion, app shows results and sends push notification

Limit initial scan window to 2 years (use newer_than:2y in Gmail query).
Process in background — never block the UI.
```

### Edge Function Timeout Handling

Supabase Edge Functions have a maximum execution time of 2 minutes (400 seconds on paid plans). For long-running initial scans, use chunked processing:

- Process max 50 emails per Edge Function invocation
- Persist progress in `sync_jobs.metadata` as `{last_page_token, processed_count}`
- Re-invoke the function for the next chunk (self-chaining or via pg_cron)

Alternatively, use a proper job queue service (Inngest, Trigger.dev) for more reliable long-running jobs. [LOW confidence on exact Supabase Edge Function timeout limits — verify current limits before deciding on self-chaining vs external job queue]

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| Mobile App (React Native / Expo) | UI, auth flow, Plaid Link SDK, subscription display | Supabase Auth, Edge Functions |
| Supabase Auth | User identity, session management | Mobile App, all tables via RLS |
| Gmail Webhook Edge Function | Receive Pub/Sub push, enqueue sync job | sync_jobs table, Gmail API |
| Plaid Webhook Edge Function | Receive Plaid webhook, enqueue sync job | sync_jobs table, Plaid API |
| Gmail Sync Edge Function | Fetch messages, run LLM extraction | Gmail API, LLM API, email_evidence, subscriptions |
| Plaid Sync Edge Function | Fetch transactions, detect recurrence | Plaid API, transaction_evidence, subscriptions |
| Merger / Deduplicator | Cross-signal merge, confidence scoring | email_evidence, transaction_evidence, subscriptions |
| Scheduler (pg_cron) | Daily fallback sync jobs, watch renewal | sync_jobs table |
| Notification Service | Push alerts for new/changed subscriptions | Expo Push API, mobile app |

---

## Data Flow

```
[Gmail API] ─────────────────────────────┐
                                         │
  Push notification via Pub/Sub          │
        │                                │
        v                                │
[Gmail Webhook EF] → [sync_jobs]         │
                          │              │
                          v              │
                [Gmail Sync EF] ─────────┤
                          │              │
                          v              │
                   [email_evidence]      │
                          │              │
                          v              │
                    [LLM Extract]        │
                          │              │
                          v              │
[Plaid API] ──── [Plaid Sync EF] ────→ [Merger EF]
                          │                  │
                   [transaction_evidence]    │
                                             v
                                     [subscriptions]
                                             │
                                             v
                                    [Mobile App UI]
                                             │
                                    [Push Notification]
```

---

## Architecture Anti-Patterns to Avoid

### Anti-Pattern 1: Polling Gmail on a Timer
**What goes wrong:** Hitting rate limits, missing messages, wasting quota, battery drain if triggered from mobile.
**Instead:** Use Gmail users.watch + Cloud Pub/Sub push delivery.

### Anti-Pattern 2: Storing Raw OAuth Tokens in Plain Columns
**What goes wrong:** Token exposure in database dumps, logs, Supabase Studio.
**Instead:** Use Supabase Vault or pgsodium-encrypted columns. Required for App Store compliance.

### Anti-Pattern 3: Single LLM Call per Email, Full Body
**What goes wrong:** High token costs (~$0.05/email for GPT-4o at full body length), slow processing, timeouts on initial scan.
**Instead:** Two-pass pipeline (cheap classifier first, expensive extractor only on confirmed positives) with body truncation to 3,000 characters.

### Anti-Pattern 4: Trusting LLM Output Without Schema Validation
**What goes wrong:** Hallucinated amounts, malformed dates, incorrect frequencies break the subscription record.
**Instead:** Use JSON mode/tool use for constrained output. Validate all fields client-side with Zod/Joi before upsert.

### Anti-Pattern 5: Building Recurrence Detection from Scratch When Plaid Has It
**What goes wrong:** Months of engineering to match what Plaid's `/transactions/recurring` already does reliably.
**Instead:** Use Plaid's endpoint as primary signal; only build custom detection for edge cases Plaid misses.

### Anti-Pattern 6: One Subscription Table Without Evidence Tables
**What goes wrong:** Can't debug false positives, can't improve model accuracy, can't show users "why" a subscription was detected.
**Instead:** Maintain separate `email_evidence` and `transaction_evidence` tables linked to the canonical `subscriptions` record.

---

## Scalability Considerations

| Concern | At 1K users | At 100K users | At 1M users |
|---------|-------------|---------------|-------------|
| Gmail quota | Shared 1B units/day, trivially fine | Need per-project quota increase with Google | Apply for quota increase; consider Gmail API reseller tier |
| LLM costs | ~$10-50/month total | ~$1K-5K/month — optimize prompt caching | Distilled fine-tuned model for classification; LLM only for extraction |
| Plaid costs | Per-item pricing, manageable | Negotiate volume pricing | Plaid's per-item model becomes expensive; evaluate alternatives |
| Supabase Edge Functions | Default limits sufficient | Upgrade to Pro/Team plan, increase concurrency | Consider dedicated worker service (Railway, Fly.io) |
| Database | Supabase free/Pro handles this easily | ~10M rows, still manageable with indexes | Partitioning on user_id; read replicas |

---

## Sources and Confidence Notes

| Claim | Confidence | Verification Needed |
|-------|------------|---------------------|
| Gmail API scopes classification | MEDIUM | Verify at developers.google.com/gmail/api/auth/scopes |
| Gmail rate limits (250 units/sec) | MEDIUM | Verify at developers.google.com/gmail/api/reference/quota |
| Gmail watch expiry (7 days) | HIGH | Well-documented, stable behavior |
| Plaid /transactions/recurring endpoint existence | MEDIUM | Verify endpoint availability in your Plaid plan at plaid.com/docs |
| Plaid RecurringTransactionStream fields | MEDIUM | Verify field names at plaid.com/docs/api/products/transactions/ |
| Supabase Edge Function timeout (2 min) | LOW | Verify at supabase.com/docs/guides/functions — may have changed |
| Supabase Vault API syntax | MEDIUM | Verify at supabase.com/docs/guides/database/vault |
| LLM pricing estimates | LOW | Verify at time of build — pricing changes frequently |
| Google OAuth app verification timeline (4-8 weeks) | LOW | Community reports only, not official SLA |

All LOW confidence items should be verified against live documentation before beginning implementation of the affected phase.
