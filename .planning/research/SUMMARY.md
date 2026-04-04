# Project Research Summary

**Project:** SubTrackr — AI-Powered Subscription Tracker
**Domain:** Personal finance / subscription management (mobile iOS + Android + web)
**Researched:** 2026-04-04
**Confidence:** MEDIUM (all findings from training data through August 2025; no live web search available — flag items noted for pre-implementation verification)

---

## Executive Summary

SubTrackr is an AI-powered subscription tracker that eliminates manual entry through two auto-detection channels: Gmail receipt scanning (LLM extraction) and Plaid bank transaction analysis (recurring charge detection). The product lives in a category dominated by Rocket Money (aggressive monetization, fragile bank sync) and Bobby (beautiful manual-only UX). The winning position is a third path: Bobby's design quality combined with Rocket Money's auto-detection, but without the exploitative fee model and with a transparent, trust-first onboarding.

The technical approach is well-understood and the stack is decided: React Native + Expo (mobile), Next.js (web), Supabase (backend + auth + DB), Plaid for bank transactions, Gmail API for email parsing, Claude/OpenAI on server-side Edge Functions for extraction, RevenueCat (mobile IAP), and Stripe (web billing) in a pnpm monorepo. The architecture is event-driven: Gmail push notifications via Cloud Pub/Sub and Plaid webhooks trigger incremental sync jobs, with pg_cron as a daily fallback. Confidence in this architecture is high — it is a well-trodden pattern for this class of fintech app.

The single largest risk is not technical: it is Google's OAuth app verification for Gmail's `gmail.readonly` scope. This is a 4–8 week manual review process with no fast-track. If verification is not started early enough, the product's differentiating feature (Gmail auto-detection) will be blocked at launch. The mitigation is to sequence Phase 1 as a fully-functional manual tracker (proving the core UX loop) while Phase 2 builds the Gmail integration in parallel — and to submit the verification application the moment Phase 2 is functional, not when launch is imminent. Plaid production access adds a secondary 1–2 week compliance lead time. Both must be treated as external dependencies with fixed lead times, not as implementation tasks.

---

## Key Findings

### Recommended Stack

The stack is decided and the research confirms it is the right call. React Native + Expo wins over Flutter decisively because Plaid ships `react-native-plaid-link-sdk` as a first-party SDK while Flutter's path requires a community wrapper that lags behind Plaid's releases. The monorepo separates the Expo mobile app from the Next.js web app — these should NOT share a single React Native Web codebase. SEO, Stripe Checkout, and proper HTML semantics require a real Next.js frontend. Shared code (types, Zod schemas, API clients) lives in `packages/core`.

A critical implementation detail from STACK.md: Supabase auth on mobile must use `expo-secure-store` as the storage adapter, not AsyncStorage. AsyncStorage tokens appear in device backups unencrypted. Gmail OAuth tokens must never be stored on the device at all — they must be exchanged server-side and stored in Supabase Vault. Plaid access tokens have the same requirement. RevenueCat requires an Expo Development Build (not Expo Go) because it uses native modules.

**Core technologies:**
- React Native + Expo SDK 51+: iOS and Android runtime — first-party Plaid SDK, Expo manages native build complexity
- Expo Router 3.x: File-based routing for mobile and web in one system
- Next.js 14+ (App Router): Web frontend — SSR for SEO, server-side OAuth callback handling, Stripe Checkout
- Supabase: Auth + Postgres DB + Edge Functions + Vault — single backend vendor covering auth, data, secrets, and serverless functions
- Supabase Edge Functions (Deno): All server-side AI calls, Gmail token exchange, Plaid token exchange, webhook handlers — API keys never touch the client
- RevenueCat: Mobile in-app purchase management — abstracts StoreKit 2 (iOS) and Google Play Billing
- Stripe: Web subscription billing
- Plaid: Bank transaction sync via `react-native-plaid-link-sdk` on mobile, Plaid.js on web
- Claude Haiku / GPT-4o-mini: First-pass email classification (cheap)
- Claude Sonnet / GPT-4o: Full subscription extraction on confirmed positives (expensive, used sparingly)
- pnpm workspaces: Monorepo tooling — better module hoisting for React Native than npm/yarn
- TanStack Query + Zustand: Server state caching and local UI state
- Zod: Runtime validation of all LLM output before database insertion

**Version notes requiring pre-implementation verification:**
- `react-native-plaid-link-sdk` — pin to specific minor version; has had breaking changes at SDK boundary transitions
- `react-native-purchases` — verify compatibility with exact Expo SDK version before starting
- Supabase Edge Function timeout limit — LOW confidence on current value; check before deciding on self-chaining vs external job queue (Inngest, Trigger.dev)

---

### Expected Features

The research converges on a clear hierarchy. The category's killer moment is surfacing a subscription the user forgot they had — this single event drives more word-of-mouth than any other feature. Everything in Phase 1 and Phase 2 exists to create that moment as quickly as possible.

**Must have (table stakes) — without these, launch is not credible:**
- Manual subscription entry with service logo recognition (top 150-200 services) — Bobby proved users will do this; it is also the fallback when integrations fail
- Monthly total + annual view toggle — "$155/year" hits harder than "$12.99/month"; annual should be prominently surfaced
- Upcoming charges calendar — horizontal scroll of next 5-7 charges sorted by date; highest-return-visit element in the entire app
- Charge reminder notifications — "Netflix · $17.99 · in 3 days" — must include service name and dollar amount to get opened
- Dark mode — absence generates 1-star reviews; non-negotiable in 2025+
- Price increase alerts — "Netflix charged $2 more than last month" — punches above its weight in user engagement

**Should have (competitive differentiators):**
- Gmail auto-detection with confidence scoring and user confirmation flow — the primary moat if accuracy exceeds 90%
- Plaid bank sync using `/transactions/recurring` endpoint — confirms active status and enables price change detection
- "Subscriptions you forgot about" surface — the conversion trigger; requires both detection layers to be meaningful
- Category breakdown (donut chart: entertainment, productivity, fitness, etc.) — entertainment is almost always 40-60% of total; seeing this is the "aha" that converts free users
- Monthly spend trend line (6-12 months) — flat is reassuring; upward slope creates urgency
- Cancellation deep links to top 100 services — praised heavily in competitor reviews; low effort, high perceived value
- CSV export — power users demand this; absence creates lock-out anxiety

**Defer to v2+:**
- Natural language AI chat ("What am I spending on entertainment?") — high value but complex; competitors don't do it well yet
- Partner/family shared household view — underserved segment, but adds auth/sharing complexity; Phase 3+ at earliest
- Savings recommendations / AI spending insights — requires 2-3 months of user data to be meaningful; launch-day version will have no data

**Anti-features to explicitly avoid:**
- Mandatory account linking at onboarding — sequential optional consent, not simultaneous required consent
- Cancellation negotiation for a percentage fee — destroys trust at the highest-value moment; show direct cancel links instead
- Subscription "scores" or guilt metrics — users disengage; present data neutrally
- Paywalling the core subscription list — free tier must show the list; gate analytics depth, not the list itself
- Notification spam — hard cap at 1 marketing notification per week; financial apps lose notification permissions within the first week if they oversend

**Free/paid tier split (HIGH confidence):**
- Free: Manual entry (unlimited) + Gmail detection (up to 10 subscriptions) + basic dashboard + calendar (next 30 days) + 1 Plaid connection
- Paid ($4.99/month or $39.99/year): Unlimited Plaid connections + unlimited Gmail history + price increase alerts + annual charge early warnings + analytics + CSV export + partner sharing
- Conversion trigger: Show the paywall immediately after a user sees their first "forgotten subscription" — highest-converting moment in the funnel

---

### Architecture Approach

The system is event-driven with three data pipelines that merge into a single canonical `subscriptions` table. Gmail push notifications (Cloud Pub/Sub) and Plaid webhooks are the primary triggers; pg_cron provides a daily fallback for missed webhook deliveries. The AI extraction pipeline uses a two-pass approach: cheap classifier first (Haiku/GPT-4o-mini), then expensive extractor only on confirmed positives. This reduces AI costs by 60-70% compared to running Sonnet on every email.

Critically, evidence is stored separately from conclusions. The `email_evidence` and `transaction_evidence` tables link to the canonical `subscriptions` record. This is not optional architecture — it enables debugging false positives, showing users why a subscription was detected, and improving prompt accuracy over time. Skipping evidence tables to save complexity is a mistake that cannot be reversed cheaply.

All OAuth tokens (Gmail, Plaid) must be stored in Supabase Vault, not plain columns. RLS policies are required on every user-data table. The multi-signal confidence scoring system (LLM confidence 40%, Plaid match bonus 25%, sender domain signal 20%, frequency signal 15%) determines whether a detected subscription auto-confirms, prompts for user review, or is discarded.

**Major components:**
1. Mobile App (React Native + Expo): UI, auth, Plaid Link SDK orchestration, subscription display — communicates with Supabase Auth and Edge Functions only
2. Supabase Edge Functions: All external API calls (Gmail, Plaid, Claude/OpenAI) — webhook receivers, sync processors, AI extraction pipeline, notification triggers
3. Gmail Sync Pipeline: Cloud Pub/Sub webhook receiver → sync job queue → Gmail API history fetch → two-pass LLM extraction → email_evidence → subscriptions upsert
4. Plaid Sync Pipeline: Plaid webhook receiver → sync job queue → `/transactions/sync` + `/transactions/recurring` → transaction_evidence → subscriptions merger
5. Merger / Deduplicator: Cross-signal merge (amount match < $0.01, merchant name fuzzy match > 0.8, date within 3 days) → confidence scoring → canonical subscription record
6. Scheduler (pg_cron): Daily fallback sync for missed webhooks, Gmail watch renewal (expires every 7 days)
7. Notification Service: Expo Push → APNs/FCM for charge reminders and price alerts
8. Web App (Next.js): Dashboard for web users, OAuth callback handlers, Stripe Checkout
9. RevenueCat + Stripe webhooks: Both update the same `user_entitlements` Supabase table; neither the mobile app nor web app queries RevenueCat/Stripe at runtime

**Key schema tables:** `profiles`, `integrations` (Gmail + Plaid tokens with sync cursors), `subscriptions` (canonical), `email_evidence`, `transaction_evidence`, `detection_feedback` (user corrections for accuracy improvement), `sync_jobs` (job queue)

---

### Critical Pitfalls

The research identifies 5 pitfalls that can block launch or cause serious user harm if not addressed:

1. **Gmail verification timeline blocks launch** — `gmail.readonly` is a sensitive scope requiring Google's manual review (4-8 weeks, no fast-track). Starting this at launch time means shipping without Gmail auto-detection. Prevention: submit the verification application the moment the Gmail integration is functional — during Phase 2, not at the end of Phase 4. Keep a 100-person test user list for the entire beta. The application requires a published privacy policy, a demo video, and a clear description of exactly how Gmail data is used and NOT used.

2. **Plaid production access requires compliance steps with lead time** — Plaid Sandbox works instantly; production access requires a signed Developer Agreement, a live privacy policy that specifically mentions Plaid, a working webhook endpoint, and 3-10 business day review. Cost: approximately $0.30-0.50 per connected account per month — free-tier users with Plaid connections are a direct cost that must be modeled into pricing. Prevention: apply for production access in parallel with Phase 2 development, not after.

3. **AI parsing false positives destroy user trust fast** — One-time charges incorrectly flagged as subscriptions are the #1 uninstall trigger in the category. The confirm/dismiss flow is not a nice-to-have — it is required architecture. Never auto-add a subscription without user confirmation. Always show the source evidence (email subject line or transaction description) alongside the detected item so users can evaluate the AI's reasoning. Prevention: confidence thresholds (auto-confirm above 0.85, prompt for review 0.60-0.84, queue for review 0.40-0.59, discard below 0.40), Zod validation of all LLM output, deduplication before display.

4. **App Store/Play Store rejection for financial data apps** — Apple requires accurate Privacy Nutrition Labels declaring financial data collection; Google requires a full-screen prominent disclosure before the Gmail OAuth screen (separate from the OAuth flow itself). Reviewers will actually test the Gmail and Plaid flows — provide test credentials in review notes. Sign in with Apple is required if any third-party login is offered. Prevention: build the prominent disclosure screen before building the OAuth flow; submit with a complete published privacy policy URL; provide test credentials.

5. **GDPR/CCPA compliance for email + financial data** — Raw email bodies must not be stored; only extracted structured data. All data sent to Claude/OpenAI must be disclosed in the privacy policy. Users must be able to trigger a full account deletion that cascades through Supabase tables AND calls Plaid's `item/remove` endpoint AND revokes Gmail tokens. Data Processing Agreements must be signed with Supabase, Plaid, Anthropic/OpenAI, and RevenueCat before launch. Prevention: write the privacy policy before Phase 2 begins; implement real cascade deletion as a first-class feature in Phase 3; sign all DPAs early.

---

## Implications for Roadmap

Based on combined research, the phase ordering is driven by two constraints: (1) external lead times for Gmail verification and Plaid production access must be started as early as possible, and (2) each integration should be built and tested independently before combining. The research explicitly warns against building Gmail + Plaid + AI simultaneously — it makes bugs undiagnosable.

### Phase 1: Foundation + Manual Tracker (The Working App)

**Rationale:** Manual entry with good UX is the fallback for all users whose integrations fail, and it is the proof-of-concept for the subscription display layer. Bobby proved users will manually enter subscriptions if the UX is excellent. This phase delivers a shippable, testable app with zero external compliance dependencies. It also forces all the core data model decisions before integrations are layered on top.

**Delivers:** Monorepo setup, auth (Supabase + expo-secure-store), core DB schema (all tables including evidence tables and feedback table), manual subscription entry with service logo library, dashboard (monthly total, annual toggle, subscription list sorted by cost, upcoming charges strip), charge reminder notifications (3-day warning), dark mode, free/paid tier gating hooks (RevenueCat + Stripe wired but minimal SKUs).

**Addresses features:** All table-stakes features. Manual entry, dashboard IA, notifications, dark mode.

**Avoids pitfalls:** No external compliance dependencies. Can ship to internal testing without Gmail or Plaid. Establishes RLS on all tables from day one.

**Research flag:** Standard patterns — no phase research needed. Expo + Supabase is well-documented.

---

### Phase 2: Gmail Auto-Detection + OAuth Verification Submission

**Rationale:** Gmail is the higher-value detection channel and the riskier integration (verification timeline). Build it second, in isolation from Plaid, so bugs are diagnosable. Start verification submission immediately when the integration is functional — this is the critical-path action for the entire project timeline.

**Delivers:** Gmail OAuth consent flow with prominent disclosure screen, `expo-auth-session` PKCE flow, server-side token exchange (Edge Function), Gmail API initial scan (batch, async, chunked to avoid timeouts), ongoing push detection (Cloud Pub/Sub + Gmail watch), two-pass LLM extraction pipeline (Haiku first pass, Sonnet on confirmed positives), confidence scoring, confirm/dismiss UX for detected subscriptions, `email_evidence` table population, progress indicator for initial scan, Google OAuth verification application submitted.

**Uses:** `expo-auth-session`, Supabase Vault for Gmail tokens, Supabase Edge Functions, Claude Haiku + Sonnet, Zod for LLM output validation, Cloud Pub/Sub infrastructure (one-time setup).

**Implements:** Gmail Sync Pipeline component, two-pass AI extraction, confidence scoring system, detection feedback loop.

**Avoids pitfalls:** Build prominent disclosure screen before OAuth flow. Test with up to 100 users in Testing mode. Submit verification application before moving to Phase 3. Privacy policy must be published before submission.

**Research flag:** Needs phase research — Gmail push architecture (Cloud Pub/Sub setup), current Google OAuth verification requirements, and Edge Function timeout limits should all be verified against live docs before starting implementation. The community-reported 4-8 week verification timeline is LOW confidence and should be confirmed at https://support.google.com/cloud/answer/9110914.

---

### Phase 3: Plaid Bank Sync + AI Confidence Boost

**Rationale:** Plaid builds on the AI extraction foundation already established in Phase 2. It is a separate, independent pipeline that merges into the same `subscriptions` table. Building it third keeps the pipelines isolated during development. Plaid production access application (3-10 business days) should be submitted at the start of Phase 3 while Sandbox development continues.

**Delivers:** Plaid Link SDK integration (mobile), `react-native-plaid-link-sdk` flow with prominent disclosure, server-side token exchange, `/transactions/sync` cursor-based ongoing sync, `/transactions/recurring` endpoint for primary recurring detection, Plaid webhook handling (`TRANSACTIONS_SYNC_UPDATES_AVAILABLE`, `ITEM_LOGIN_REQUIRED`, `PENDING_EXPIRATION`, `USER_PERMISSION_REVOKED`), cross-signal merger/deduplicator (Gmail + bank data merged to single subscription record), multi-signal confidence scoring, "bank disconnected — reconnect" UX, price change detection (charge variance detection), `transaction_evidence` table population, Plaid production access approved.

**Uses:** `react-native-plaid-link-sdk`, Plaid Node SDK (server-side), `/transactions/recurring`, Supabase Vault for Plaid tokens.

**Implements:** Plaid Sync Pipeline component, Merger/Deduplicator component.

**Avoids pitfalls:** Apply for Plaid production access immediately. Model per-user Plaid cost ($0.30-0.50/month) into pricing before launch. Handle `ITEM_LOGIN_REQUIRED` webhook from day one — no stubs. Use `transactions/sync` not deprecated `transactions/get`.

**Research flag:** Needs phase research — verify `/transactions/recurring` endpoint availability in your Plaid pricing tier, current Plaid production checklist, and current per-item pricing at https://plaid.com/docs/launch-checklist/ before starting.

---

### Phase 4: Analytics + Monetization Completion

**Rationale:** Analytics require accumulated data to be meaningful (2-3 months minimum). Phase 4 is the earliest this data exists. Monetization can be completed here since RevenueCat/Stripe hooks were wired in Phase 1 — this phase just adds the full SKU configuration and paywall screens.

**Delivers:** Category breakdown (donut chart), monthly spend trend line (6-12 months), annual charge early warnings (14-day and 3-day for annual subscriptions), savings opportunities surface ("We found 3 more — unlock full history with Pro"), full paywall screens with free/paid split, RevenueCat entitlement gating for all paid features, Stripe Checkout for web, CSV export, RevenueCat + Stripe webhook sync to `user_entitlements`, cancellation deep links for top 100 services.

**Avoids pitfalls:** Model AI processing cost at 1K, 10K, 100K users before finalizing pricing. Implement full cascade account deletion (Supabase tables + Plaid `item/remove` + Gmail token revocation).

**Research flag:** Standard patterns — RevenueCat RN SDK is well-documented, HIGH confidence.

---

### Phase 5: Compliance, Privacy, and App Store Submission

**Rationale:** All compliance work is consolidated here, but the privacy policy and DPAs must be started earlier (before Phase 2 Gmail verification submission). This phase finalizes them, adds any required in-app consent flows, and prepares the App Store submission package.

**Delivers:** Finalized privacy policy (covering Gmail data, Plaid role, AI processing disclosure, GDPR/CCPA language), signed DPAs with Supabase, Plaid, Anthropic/OpenAI, RevenueCat, Sign in with Apple integration (required alongside Gmail OAuth login), Privacy Nutrition Labels (Apple) and Data Safety section (Google Play) accurately declared, test Gmail account + Plaid Sandbox credentials prepared for App Store reviewers, full account deletion user flow (real cascade), Google OAuth verification status confirmed (target: approved before this phase ends).

**Avoids pitfalls:** Do not treat privacy/compliance as post-launch. App Store reviewers will test Gmail and Plaid flows — unprepared submissions cause multi-week delays.

**Research flag:** Legal review recommended before submission if budget allows. GDPR/CCPA specifics are MEDIUM confidence — verify current thresholds.

---

### Phase 6: Launch + Retention

**Delivers:** Production Plaid access live, Gmail OAuth verified for production users, App Store and Play Store submissions, post-launch monitoring (Supabase token usage, AI cost per user, notification opt-out rates), feedback loop processing (detection_feedback → prompt iteration), push notification tuning (9am local time delivery, frequency caps enforced).

**Research flag:** Standard patterns — Expo EAS build + submission is well-documented.

---

### Phase Ordering Rationale

- Phase 1 before everything: Establishes the data model and working app before any external dependencies are added. The evidence tables and feedback schema must exist from day one — retrofitting them into an existing data model is painful.
- Gmail (Phase 2) before Plaid (Phase 3): Gmail verification has a longer lead time and is harder to get approved. Starting it earlier gives more runway. Building integrations sequentially makes bugs diagnosable.
- Analytics (Phase 4) after detection (Phases 2-3): Data must exist before analytics are meaningful. Showing a trend line to a user with 2 weeks of data is a trust-eroding experience, not a value-adding one.
- Compliance (Phase 5) not last: The privacy policy and DPA signing must begin in Phase 2 (Google verification requirement). Phase 5 finalizes and audits — it is not the starting point for compliance.
- The most dangerous project risk is a launch delay caused by Gmail verification timing. The mitigation is treating the verification submission as a Phase 2 deliverable, not a pre-launch task.

### Research Flags

**Needs `/gsd:research-phase` during planning:**
- Phase 2 (Gmail integration): Cloud Pub/Sub infrastructure setup, current Google OAuth verification requirements, Edge Function timeout limits and self-chaining vs external job queue decision
- Phase 3 (Plaid integration): `/transactions/recurring` endpoint availability by pricing tier, current Plaid production checklist, Plaid SDK version compatibility with Expo SDK

**Standard patterns (skip research-phase):**
- Phase 1 (Foundation): Expo + Supabase + React Native is well-documented; HIGH confidence throughout
- Phase 4 (Analytics + Monetization): RevenueCat RN SDK patterns are stable; HIGH confidence
- Phase 6 (Launch): EAS + App Store submission is standard Expo workflow

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | RN vs Flutter decision is clear (Plaid first-party SDK). Expo + Supabase pattern is well-established. RevenueCat RN SDK is stable. Gmail and Plaid integration details are MEDIUM — SDK version specifics need live verification. |
| Features | MEDIUM-HIGH | Category pain points and loved features are consistent across training data. Free/paid split rationale is HIGH. Competitor pricing is MEDIUM — prices change and need live verification before using competitively. |
| Architecture | MEDIUM | Overall event-driven pattern is correct and well-established. Edge Function timeout limits are LOW — must verify before Phase 2 implementation. Plaid `/transactions/recurring` endpoint fields are MEDIUM. LLM pricing estimates are LOW. |
| Pitfalls | HIGH | Gmail verification policy, Plaid compliance requirements, App Store financial app policies, and AI false positive patterns are all stable, well-documented facts. AI cost estimates are MEDIUM. |

**Overall confidence:** MEDIUM-HIGH

All HIGH confidence findings reflect stable, published policies and well-documented SDK patterns. The MEDIUM and LOW items are SDK-version specifics and pricing details that change and must be verified against live documentation before implementation of the affected phase begins.

### Gaps to Address

- **Gmail verification current timeline:** Community reports say 4-8 weeks but this is LOW confidence. Verify at https://support.google.com/cloud/answer/9110914 before committing to a launch date. This number directly determines whether Gmail ships at launch or post-launch.
- **Plaid `/transactions/recurring` availability:** This endpoint is the architectural foundation of the bank sync pipeline. Verify it is included in your Plaid pricing tier at plan setup, not mid-Phase 3.
- **Supabase Edge Function timeout:** LOW confidence on the 2-minute limit. If it is shorter, self-chaining chunked processing may not be viable and an external job queue (Inngest, Trigger.dev) becomes necessary for the initial Gmail scan. Verify before Phase 2 design is finalized.
- **AI cost per user at scale:** The $0.30/user onboarding scan estimate is MEDIUM confidence. Instrument token usage from the first production user and set cost alerts before reaching 1,000 MAU. This directly affects paid tier pricing.
- **Plaid per-item cost:** Approximate $0.30-0.50/month/connected account. Get current pricing from Plaid's team during the production access application, not from documentation.

---

## Sources

### Primary (HIGH confidence — stable published policies)
- Google OAuth app verification policy — https://support.google.com/cloud/answer/9110914
- Plaid production launch checklist — https://plaid.com/docs/launch-checklist/
- Apple App Store Review Guidelines 5.1.1 and 2.1 — https://developer.apple.com/app-store/review/guidelines/
- Google Play Prominent Disclosure policy — https://support.google.com/googleplay/android-developer/answer/9888076
- Gmail API scope classifications — https://developers.google.com/gmail/api/auth/scopes

### Secondary (MEDIUM confidence — community consensus + training data synthesis)
- RevenueCat React Native SDK patterns — https://www.revenuecat.com/docs/getting-started/installation/reactnative
- Plaid React Native SDK — https://github.com/plaid/react-native-plaid-link-sdk
- Supabase + Expo guide — https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native
- Plaid `/transactions/recurring` endpoint — https://plaid.com/docs/api/products/transactions/
- Supabase Vault — https://supabase.com/docs/guides/database/vault
- Gmail API rate limits — https://developers.google.com/gmail/api/reference/quota

### Tertiary (LOW confidence — estimates needing live verification)
- Gmail OAuth verification timeline: 4-8 weeks (community reports, not official SLA)
- Supabase Edge Function timeout: ~2 minutes (verify current limit before Phase 2)
- LLM pricing: $0.002-0.005 per two-pass email (pricing changes frequently; verify at build time)
- Plaid per-item pricing: ~$0.30-0.50/month (verify with Plaid team during production access application)

---

*Research completed: 2026-04-04*
*Ready for roadmap: yes*
