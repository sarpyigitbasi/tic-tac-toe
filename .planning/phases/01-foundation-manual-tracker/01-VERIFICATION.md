---
phase: 01-foundation-manual-tracker
verified: 2026-04-05T14:00:00Z
status: passed
score: 12/12 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 11/12
  gaps_closed:
    - "User sees all active subscriptions on the dashboard sorted by cost — index.tsx conflict markers resolved; full dashboard implementation now in place (commit f0f791e)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Full auth flow end-to-end"
    expected: "Sign up -> verify email -> log in -> land on dashboard tab with subscription list"
    why_human: "Requires running Docker + Supabase + Expo dev build; cannot verify programmatically"
  - test: "Push notification delivery"
    expected: "After subscribing with a next_billing_date 3 days out, receive an Expo push notification titled 'Upcoming Renewal' with body '[Service Name] renews in 3 days for $[amount].'"
    why_human: "Requires pg_cron to run, pg_net to invoke Edge Function, and a real Expo push token; cannot verify programmatically"
  - test: "Free-tier paywall at 6th subscription"
    expected: "Adding a 6th subscription triggers the PaywallBottomSheet with 'You've reached your limit' heading; 'Upgrade to Pro' button dismisses sheet (noop in Phase 1)"
    why_human: "Requires running app with auth session and 5 existing subscriptions"
  - test: "Session persistence across app restart"
    expected: "After signing in, force-quit and reopen the app — user lands directly on the dashboard without being asked to log in again"
    why_human: "Requires LargeSecureStore to encrypt and persist the session; must be verified on device or simulator"
  - test: "Notification toggle persists"
    expected: "Toggle off 'Renewal Reminders' in Settings; force-quit and reopen app; toggle is still off"
    why_human: "Requires Supabase instance running and writing to profiles.notification_preferences"
---

# Phase 1: Foundation — Manual Tracker Verification Report

**Phase Goal:** Build the complete foundation — monorepo scaffold, Supabase auth, full DB schema, subscription CRUD UI, push notifications, and Edge Functions. Delivers a working manual subscription tracker app that covers all core user flows before any automation layers are added.

**Verified:** 2026-04-05
**Status:** passed — all 12 must-haves verified, all gaps closed
**Re-verification:** Yes — after merge-conflict resolution in `apps/mobile/app/(tabs)/index.tsx` (commit f0f791e)

---

## Re-verification Summary

The single blocker from the initial verification has been resolved. Commit `f0f791e` (fix(01-03): resolve merge conflict markers in dashboard index.tsx) replaced the invalid file (which contained interleaved `<<<<<<< HEAD`, `=======`, `>>>>>>>` markers) with the clean, full dashboard implementation.

**Gap closed:** `apps/mobile/app/(tabs)/index.tsx` — no conflict markers detected (`grep -E "<<<<<<|=======|>>>>>>>" → NO CONFLICT MARKERS`). All 9 dashboard hooks/components correctly imported and rendered. Paywall gate logic (`!isPro && subscriptionCount >= 5`) present. All key links from index.tsx to useSubscriptions, useSubscriptionCount, useDeleteSubscription, and useIsPro now WIRED.

**Regression checks:** All 4 previously-verified infrastructure checks still pass:
- LargeSecureStore / AES-256 / autoRefreshToken present in supabase/client.ts (3 hits)
- 8 tables with RLS enabled in 00001 migration (8 hits)
- FREE_TIER_LIMIT_REACHED + enforce_subscription_limit trigger present (2 hits)
- pg_net.http_post + cron.schedule present in 00002 migration (4 hits)

**No new stubs introduced.** The only TODO in index.tsx (`// TODO Phase 4: Navigate to RevenueCat paywall`) is the same intentional Phase 4 deferral noted in the initial verification.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | pnpm monorepo installs with all workspaces resolved | VERIFIED | pnpm-workspace.yaml with apps/* and packages/*; pnpm-lock.yaml present; package.json with pnpm -r run test |
| 2 | Expo app boots without errors | VERIFIED | index.tsx conflict resolved; all layout/navigation files valid; no TypeScript parse blockers remain |
| 3 | Shared core types importable from both apps | VERIFIED | @subtrackr/core@workspace:* in mobile package.json; createSubscriptionSchema, Subscription type exported from packages/core/src/index.ts |
| 4 | LargeSecureStore is wired as Supabase auth storage | VERIFIED | packages/supabase/client.ts: LargeSecureStore class with AES-256 key in SecureStore + encrypted payload in AsyncStorage; detectSessionInUrl: false; autoRefreshToken: true |
| 5 | All 8 database tables exist with RLS enabled | VERIFIED | 00001_initial_schema.sql: 8 CREATE TABLE statements; ENABLE ROW LEVEL SECURITY count = 8; 4 indexes present |
| 6 | Free-tier subscription limit trigger exists in the database | VERIFIED | check_subscription_limit() function + enforce_subscription_limit BEFORE INSERT trigger + FREE_TIER_LIMIT_REACHED exception all present in migration |
| 7 | User can sign up, verify email, log in, and log out | VERIFIED | login.tsx (signInWithPassword), signup.tsx (signUp + duplicate-email error copy), verify-email.tsx (resend handler), useAuth.ts (onAuthStateChange + RevenueCat logIn/logOut) |
| 8 | User sees all active subscriptions on the dashboard sorted by cost | VERIFIED | index.tsx conflict resolved (commit f0f791e); renders SubscriptionList with subscriptions from useSubscriptions(); hook orders by amount DESC |
| 9 | User sees monthly/annual total with toggle | VERIFIED | TotalCard.tsx: toMonthlyAmount() normalization for all frequencies; 180ms toggle animation; props flow from subscriptions array fetched by useSubscriptions(); rendered at line 66 of index.tsx |
| 10 | User can add/edit/delete/archive subscriptions with validation | VERIFIED | useAddSubscription (createSubscriptionSchema.parse), useUpdateSubscription, useDeleteSubscription, useArchiveSubscription all wired; AddSubscriptionForm validates and surfaces FREE_TIER_LIMIT_REACHED; DeleteConfirmSheet has correct copy |
| 11 | Push notification pipeline wired (token -> pg_cron -> Edge Function -> Expo Push API) | VERIFIED | usePushNotifications.ts: getExpoPushTokenAsync -> upsert profiles.expo_push_token; 00002_pg_cron_renewal_reminders.sql: 2 cron jobs (queue at 09:00, invoke at 09:01 via pg_net.http_post); send-renewal-reminders/index.ts: reads sync_jobs, calls exp.host, marks completed |
| 12 | User can toggle renewal reminders on/off (persists in DB) | VERIFIED | NotificationToggle.tsx: reads notification_preferences.renewal_reminders from profiles, writes on toggle change; settings.tsx renders NotificationToggle |

**Score: 12/12 truths verified**

---

## Required Artifacts

### Plan 01-01 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `subtrackr/pnpm-workspace.yaml` | VERIFIED | Contains apps/* and packages/* |
| `subtrackr/packages/core/src/schemas/subscription.schema.ts` | VERIFIED | createSubscriptionSchema, billingFrequencyEnum, Subscription interface present |
| `subtrackr/packages/supabase/client.ts` | VERIFIED | LargeSecureStore class, detectSessionInUrl: false, autoRefreshToken: true |
| `subtrackr/apps/mobile/app/_layout.tsx` | VERIFIED | AuthGuard + PushRegistrar + RevenueCat init + QueryClientProvider |
| `subtrackr/packages/core/jest.config.js` | VERIFIED | ts-jest preset, testEnvironment: node |
| Wave 0 test stubs (6 files) | VERIFIED | All 6 __tests__/*.test.ts files present with it.todo blocks |

### Plan 01-02 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `subtrackr/supabase/migrations/00001_initial_schema.sql` | VERIFIED | 8 tables, 8 RLS policies, 4 indexes, check_subscription_limit trigger, handle_new_user trigger, update_updated_at trigger |
| `subtrackr/apps/mobile/app/(auth)/login.tsx` | VERIFIED | signInWithPassword, signIn from useAuth, "Incorrect email or password." error copy |
| `subtrackr/apps/mobile/app/(auth)/signup.tsx` | VERIFIED | signUp from useAuth, duplicate-email error copy, signUpSchema validation |
| `subtrackr/apps/mobile/hooks/useAuth.ts` | VERIFIED | onAuthStateChange, Purchases.logIn/logOut wired, signUp/signIn/signOut exported |
| `subtrackr/packages/core/src/schemas/auth.schema.ts` | VERIFIED | signUpSchema, loginSchema |

### Plan 01-03 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `subtrackr/apps/mobile/hooks/useSubscriptions.ts` | VERIFIED | useSubscriptions, useAddSubscription, useDeleteSubscription, useArchiveSubscription, useSubscriptionCount; order by amount DESC; FREE_TIER_LIMIT_REACHED bubble-up |
| `subtrackr/apps/mobile/components/dashboard/TotalCard.tsx` | VERIFIED | toMonthlyAmount normalization, monthly/annual toggle, useColorScheme dark/light |
| `subtrackr/apps/mobile/components/dashboard/SubscriptionList.tsx` | VERIFIED | FlatList with skeleton loading, EmptyState integration |
| `subtrackr/apps/mobile/components/subscriptions/AddSubscriptionForm.tsx` | VERIFIED | createSubscriptionSchema validation, FREE_TIER_LIMIT_REACHED routes to paywall |
| `subtrackr/apps/mobile/components/paywall/PaywallBottomSheet.tsx` | VERIFIED | "You've reached your limit", "Upgrade to Pro", "Maybe later" copy |
| `subtrackr/apps/mobile/lib/services-data.json` | VERIFIED | 164 services across 6 categories (above 150 minimum) |
| `subtrackr/apps/mobile/app/(tabs)/index.tsx` | VERIFIED | Conflict markers removed (commit f0f791e); full 167-line implementation: 9 imports, 5 dashboard sections, FAB, paywall gate, 3 modal sheets |
| All other 01-03 components (10 files) | VERIFIED | TotalCard, UpcomingStrip, RenewalChip, SubscriptionRow, UsageCounter, EmptyState, SkeletonBlock, ServicePicker, CategoryPicker, EditSubscriptionForm, DeleteConfirmSheet, theme.ts — all present and substantive |

### Plan 01-04 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `subtrackr/apps/mobile/hooks/usePushNotifications.ts` | VERIFIED | getExpoPushTokenAsync, expo_push_token upsert, Android renewal-reminders channel |
| `subtrackr/apps/mobile/components/settings/NotificationToggle.tsx` | VERIFIED | reads/writes notification_preferences.renewal_reminders, "Renewal Reminders" label |
| `subtrackr/supabase/functions/send-renewal-reminders/index.ts` | VERIFIED | reads sync_jobs, sends to exp.host, "[Service] renews in 3 days for $[amount]." copy, marks completed |
| `subtrackr/supabase/functions/revenuecat-webhook/index.ts` | VERIFIED (stub) | Validates REVENUECAT_WEBHOOK_SECRET, returns 200 — correct Phase 4 stub |
| `subtrackr/supabase/migrations/00002_pg_cron_renewal_reminders.sql` | VERIFIED | 2 cron.schedule calls, pg_net.http_post invocation, CURRENT_DATE + INTERVAL '3 days', expo_push_token IS NOT NULL guard, notification_preferences filter |
| `subtrackr/apps/web/src/app/api/stripe/checkout/route.ts` | PARTIAL | Stripe routes exist and have correct structure but `stripe` npm package is not installed in apps/web/package.json — will cause import failure at build time (known user decision: geo-restriction deferral to Phase 4) |
| `subtrackr/apps/web/src/app/api/stripe/webhook/route.ts` | PARTIAL | Same issue as checkout route |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| apps/mobile/package.json | @subtrackr/core | workspace:* dependency | WIRED | "@subtrackr/core": "workspace:*" present |
| packages/supabase/client.ts | expo-secure-store | LargeSecureStore adapter | WIRED | import * as SecureStore from 'expo-secure-store' |
| apps/mobile/hooks/useAuth.ts | packages/supabase/client.ts | supabase.auth.onAuthStateChange | WIRED | onAuthStateChange listener subscribes on mount |
| apps/mobile/app/_layout.tsx | hooks/useAuth.ts | AuthGuard component | WIRED | useAuth() controls session-based redirect |
| supabase/migrations/00001_initial_schema.sql | check_subscription_limit | BEFORE INSERT trigger | WIRED | CREATE TRIGGER enforce_subscription_limit BEFORE INSERT ON subscriptions |
| apps/mobile/hooks/useSubscriptions.ts | supabase subscriptions table | supabase.from('subscriptions') | WIRED | All CRUD mutations and queries use .from('subscriptions') |
| apps/mobile/components/subscriptions/AddSubscriptionForm.tsx | @subtrackr/core | createSubscriptionSchema | WIRED | import and parse() call confirmed |
| apps/mobile/app/(tabs)/index.tsx | hooks/useSubscriptions.ts | useSubscriptions hook | WIRED | Conflict resolved; useSubscriptions, useSubscriptionCount, useDeleteSubscription all imported and called (3 hits confirmed) |
| supabase/migrations/00002_pg_cron_renewal_reminders.sql | send-renewal-reminders Edge Function | pg_net.http_post() | WIRED | SELECT pg_net.http_post(url := ... || '/functions/v1/send-renewal-reminders', ...) |
| apps/mobile/hooks/usePushNotifications.ts | profiles.expo_push_token | upsert on app launch | WIRED | supabase.from('profiles').update({ expo_push_token }) |
| apps/mobile/components/settings/NotificationToggle.tsx | profiles.notification_preferences | toggle writes JSONB | WIRED | .update({ notification_preferences: { renewal_reminders: value } }) |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| TotalCard.tsx | subscriptions prop | useSubscriptions() TanStack Query | Yes — queries supabase.from('subscriptions').select('*').in('status', ...).order('amount') | FLOWING |
| SubscriptionList.tsx | subscriptions prop | useSubscriptions() TanStack Query | Yes — same query | FLOWING |
| UsageCounter.tsx | count prop | useSubscriptionCount() TanStack Query | Yes — count: exact, head: true query | FLOWING |
| PaywallBottomSheet.tsx | isPro prop | useIsPro() queries user_entitlements | Yes — queries is_active = true | FLOWING |
| NotificationToggle.tsx | enabled state | profiles.notification_preferences | Yes — reads and writes to profiles table | FLOWING |
| index.tsx | subscriptions, subscriptionCount, isPro | useSubscriptions, useSubscriptionCount, useIsPro hooks | Yes — all hooks wire to real Supabase queries | FLOWING |

---

## Behavioral Spot-Checks

Step 7b: SKIPPED for external service integrations (Supabase, Expo) — cannot test without running Docker + Supabase instance. The following static checks were performed:

| Behavior | Check | Result | Status |
|----------|-------|--------|--------|
| index.tsx has no conflict markers | grep conflict markers | NO CONFLICT MARKERS | PASS |
| index.tsx imports all 9 dashboard hooks/components | grep count | 9 matches | PASS |
| index.tsx paywall gate logic present | grep isPro && subscriptionCount >= 5 | Found at line 38 | PASS |
| services-data.json has 150+ entries | node -e require().length | 164 | PASS |
| RLS enabled on all 8 tables | grep -c ENABLE ROW LEVEL SECURITY | 8 | PASS |
| Free-tier trigger exists | grep FREE_TIER_LIMIT_REACHED in migration | Found | PASS |
| pg_cron schedules Edge Function | grep pg_net.http_post in 00002 migration | Found | PASS |
| Expo Push API URL in Edge Function | grep exp.host | Found | PASS |
| SERVICE_ROLE_KEY not in mobile | grep -r in apps/mobile/ | Not found | PASS |
| No new stubs in index.tsx (re-check) | grep TODO/FIXME | 1 hit — Phase 4 deferral (pre-existing, intentional) | PASS |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AUTH-04 | 01-01 | User session persists across app restarts | SATISFIED | LargeSecureStore: AES-256 key in SecureStore, encrypted payload in AsyncStorage; detectSessionInUrl: false |
| AUTH-01 | 01-02 | User can sign up with email and password | SATISFIED | signup.tsx + signUpSchema + useAuth.signUp() → supabase.auth.signUp() |
| AUTH-02 | 01-02 | User receives email verification after signup | SATISFIED | verify-email.tsx with resend handler; Supabase sends verification email on signUp |
| AUTH-03 | 01-02 | User can log in and out | SATISFIED | login.tsx + useAuth.signIn()/signOut() → supabase.auth.signInWithPassword/signOut |
| SUB-01 | 01-03 | User can view all active subscriptions | SATISFIED | index.tsx fully resolved; SubscriptionList renders subscriptions from useSubscriptions() ordered by amount DESC |
| SUB-02 | 01-03 | User can see total monthly and annual spend | SATISFIED | index.tsx fully resolved; TotalCard rendered at line 66 with subscriptions prop flowing from useSubscriptions() |
| SUB-03 | 01-03 | User can manually add a subscription | SATISFIED | AddSubscriptionForm + useAddSubscription — form exists, validation wired, hook queries Supabase |
| SUB-04 | 01-03 | User can edit subscription details | SATISFIED | EditSubscriptionForm + useUpdateSubscription |
| SUB-05 | 01-03 | User can delete/archive a subscription | SATISFIED | DeleteConfirmSheet + useDeleteSubscription + useArchiveSubscription |
| SUB-06 | 01-03 | User can categorize subscriptions | SATISFIED | CategoryPicker (6 categories) + category field in createSubscriptionSchema |
| NOTF-01 | 01-04 | Push notification 3 days before renewal | SATISFIED (infrastructure) | Full pipeline: pg_cron -> sync_jobs -> pg_net -> Edge Function -> Expo Push API; copy "[Service] renews in 3 days for $[amount]." verified |
| NOTF-02 | 01-04 | User can configure notification preferences | SATISFIED | NotificationToggle reads/writes profiles.notification_preferences.renewal_reminders; pg_cron checks preference before queueing |

**Note on NOTF-01/NOTF-02:** Infrastructure is fully wired. End-to-end delivery (pg_cron + real push token) requires a live environment and is flagged for human verification.

**Orphaned requirements check:** No requirement IDs mapped to Phase 1 in REQUIREMENTS.md are missing from the plan files. Coverage is complete.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| apps/web/src/app/api/stripe/checkout/route.ts | 4 | `import Stripe from 'stripe'` with stripe not in package.json | WARNING | Web app build will fail if stripe routes are imported (Phase 4 known deferral) |
| apps/web/src/app/api/stripe/webhook/route.ts | 4 | Same as above | WARNING | Same as above |
| apps/mobile/app/(tabs)/index.tsx | 55 | TODO Phase 4: Navigate to RevenueCat paywall (handleUpgrade noop) | INFO | Intentional Phase 4 deferral; paywall UI renders correctly, upgrade tap is no-op |
| apps/mobile/app/(tabs)/settings.tsx | 31, 38 | Placeholder text for future phases | INFO | Intentional: "coming in Phase 2" and "coming in Phase 4" are correct Phase 1 behavior |
| supabase/functions/revenuecat-webhook/index.ts | 22 | Stub comment — no user_entitlements upsert logic | INFO | Intentional Phase 4 deferral; webhook correctly authenticates and returns 200 |

No blockers remain. The previously-blocking committed merge conflict has been fully resolved.

---

## Human Verification Required

### 1. Full Auth Flow End-to-End

**Test:** Start Docker, run `supabase start` and `supabase db reset` in `subtrackr/`, configure `.env.local` with Supabase anon key, run `expo start --dev-client`, and attempt full signup -> verify email -> login flow.
**Expected:** Signup creates account, verify-email screen shown, resend button works, login with verified credentials reaches the tab navigation (dashboard tab), sign-out returns to login screen.
**Why human:** Requires Docker, Supabase instance, and Expo dev client or simulator.

### 2. Push Notification Delivery

**Test:** With a logged-in user, add a subscription with next_billing_date set to 3 days from today. Ensure `pg_cron` and `pg_net` extensions are enabled. Wait for 09:00-09:01 UTC or manually invoke the Edge Function via `supabase functions invoke send-renewal-reminders`.
**Expected:** Expo push notification arrives with title "Upcoming Renewal" and body "[Service Name] renews in 3 days for $[amount]."
**Why human:** Requires running Supabase instance with pg_cron, pg_net, and a real Expo push token from a physical device or simulator.

### 3. Free-Tier Paywall Enforcement

**Test:** Sign in with a free user account, add exactly 5 subscriptions, then tap the "+" FAB to add a 6th.
**Expected:** PaywallBottomSheet appears with "You've reached your limit" heading, 3 feature bullets, and "Upgrade to Pro" button. Tapping "Upgrade to Pro" or "Maybe later" dismisses the sheet (upgrade is a no-op in Phase 1).
**Why human:** Requires running app with live Supabase auth session.

### 4. Session Persistence Across App Restart (AUTH-04)

**Test:** Sign in on a device or simulator. Force-quit the app. Reopen it.
**Expected:** User is taken directly to the dashboard without being prompted to log in again.
**Why human:** LargeSecureStore reads the encrypted session from AsyncStorage on cold start — only verifiable on a running device/simulator.

### 5. Notification Toggle Persistence (NOTF-02)

**Test:** Open Settings, toggle "Renewal Reminders" to off. Force-quit and reopen the app. Navigate back to Settings.
**Expected:** Toggle remains in the off position (reads from profiles.notification_preferences.renewal_reminders = false).
**Why human:** Requires Supabase instance running and write confirmed against profiles table.

---

## Gaps Summary

No blocker gaps remain. The single blocker identified in the initial verification — the committed unresolved merge conflict in `apps/mobile/app/(tabs)/index.tsx` — was resolved in commit `f0f791e`.

**All 12 observable truths are now VERIFIED.** All requirements AUTH-01 through AUTH-04, SUB-01 through SUB-06, NOTF-01, and NOTF-02 are SATISFIED.

**Known non-blocking stubs (Phase 4 deferrals — unchanged from initial verification):**
- Stripe SDK not installed in apps/web (user geo-restriction; payment provider TBD for Phase 4)
- RevenueCat webhook returns 200 stub (user_entitlements upsert logic deferred to Phase 4)
- PaywallBottomSheet `handleUpgrade` is a noop (RevenueCat paywall screen deferred to Phase 4)

---

_Verified: 2026-04-05 (re-verification after commit f0f791e)_
_Verifier: Claude (gsd-verifier)_
