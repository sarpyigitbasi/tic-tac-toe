# Technology Stack: Subscription Tracker (Mobile + Web)

**Project:** Subscription tracker — iOS, Android, Web
**Researched:** 2026-04-04
**Source note:** WebSearch, WebFetch, Brave, Exa, and Firecrawl are all disabled in this environment.
All findings are from training data (cutoff August 2025). Confidence levels are assigned honestly.
**Validate before shipping:** Check official docs for RevenueCat, Plaid, and Supabase SDK versions
before starting each integration phase.

---

## Recommended Stack

### Decision: React Native (Expo) over Flutter

**Verdict:** React Native with Expo SDK is the right choice for this project.
**Confidence:** HIGH (this is a clear call given the integration list, not a close race)

**Rationale:**

1. **Plaid Link SDK** — Plaid ships `react-native-plaid-link-sdk` as a first-party package
   with active maintenance. The Flutter path requires a community-maintained wrapper
   (`flutter_plaid` or DIY WebView embedding) that lags behind Plaid's own release cadence.
   Plaid's own docs prioritize React Native. This single factor tips the decision decisively.

2. **RevenueCat** — Both platforms are first-party supported (`react-native-purchases` and
   `purchases-flutter`). RevenueCat's React Native SDK has more GitHub activity and community
   examples. Roughly equivalent here, but RN wins on ecosystem maturity.

3. **Supabase** — `@supabase/supabase-js` works identically in Expo/RN with AsyncStorage.
   The Flutter SDK (`supabase_flutter`) is solid too. Equal here.

4. **AI/LLM calls** — These go server-side (Edge Functions) in both cases. No difference.

5. **Web version** — React Native Web (`react-native-web`) or a shared component layer with
   Next.js is a well-trodden path for RN projects. Flutter Web exists but has significant
   known gaps in SEO, accessibility, and web-native feel as of mid-2025.

6. **Solo/small team velocity** — If the team knows JavaScript/TypeScript, React Native
   avoids a full language switch. Dart is learnable but adds friction at the start.

7. **Expo Router** — File-based routing that works across iOS, Android, and web in a single
   codebase. Reduces the boilerplate cost significantly for a solo team.

**When Flutter would win:** Pixel-perfect custom UI, heavy animation/game-like interactions,
or a team already fluent in Dart. None of those apply here.

---

## Core Stack

### Mobile Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React Native | 0.74+ | iOS + Android runtime | First-party Plaid SDK, largest JS ecosystem |
| Expo SDK | 51+ | Build tooling, OTA updates, managed workflow | Eliminates Xcode/Gradle friction for solo dev |
| Expo Router | 3.x | File-based navigation (mobile + web) | One router for all platforms |
| TypeScript | 5.x | Type safety across entire codebase | Catches integration contract mismatches early |

### Web Frontend

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js | 14+ (App Router) | Web frontend | SSR for SEO, API routes for OAuth callbacks |
| Tailwind CSS | 3.x | Styling | Fast iteration, consistent with mobile design tokens |

**Note on shared code:** The mobile app (Expo) and the web app (Next.js) should be separate
apps in a monorepo. Do not use `react-native-web` to serve the marketing/dashboard web — the
web version needs proper HTML semantics, SEO, and Stripe Checkout. Keep them separate.
Share business logic (types, API clients, validation) via a `packages/core` workspace.

### Backend

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Supabase | current | Auth, Postgres DB, Realtime, Storage | Covers auth + DB + file storage in one; already decided |
| Supabase Edge Functions | current | Server-side AI calls, webhook handlers | Runs Deno; avoids exposing API keys on client |
| Supabase Row Level Security | current | Per-user data isolation | Critical for a multi-tenant subscription app |

### Payments

| Technology | Platform | Purpose | Why |
|------------|----------|---------|-----|
| RevenueCat | iOS + Android | In-app purchase management | Abstracts StoreKit 2 (iOS) and Google Play Billing; handles receipt validation, entitlements, webhooks |
| Stripe | Web | Web subscription billing | Standard choice; integrates with Supabase via webhooks |

**RevenueCat + Stripe co-existence pattern:** Use RevenueCat's webhook → Supabase Edge Function
to sync mobile purchase status into your `profiles` or `subscriptions` table. Use Stripe
webhook → Supabase Edge Function for web purchases. Both update the same `user_entitlements`
table. The mobile app and web app both read entitlements from Supabase — they never talk
directly to RevenueCat or Stripe at query time.

### Integrations

| Service | SDK / Approach | Notes |
|---------|---------------|-------|
| Gmail API | OAuth 2.0 via Google Identity Services; server-side token exchange | See Gmail section below |
| Plaid Link | `react-native-plaid-link-sdk` (mobile), Plaid.js (web) | See Plaid section below |
| Claude / OpenAI | Called server-side from Supabase Edge Functions only | Never expose API keys on client |

### Supporting Libraries (Mobile)

| Library | Purpose | When to Use |
|---------|---------|-------------|
| `@supabase/supabase-js` | Supabase client | Always |
| `expo-secure-store` | Store tokens securely | Replace AsyncStorage for auth tokens |
| `expo-auth-session` | OAuth flows (Google/Gmail) | Built-in PKCE support, handles redirect URIs |
| `react-native-purchases` | RevenueCat SDK | Mobile IAP management |
| `react-native-plaid-link-sdk` | Plaid Link | Bank connection flow |
| `expo-notifications` | Push notifications | Renewal reminders |
| `react-query` / TanStack Query | Server state, caching | Pairs well with Supabase |
| `zustand` | Local UI state | Lightweight, no boilerplate |
| `zod` | Runtime validation | Validate AI-parsed subscription data |

### Supporting Libraries (Web)

| Library | Purpose |
|---------|---------|
| `@supabase/ssr` | Supabase auth in Next.js App Router |
| `@stripe/stripe-js` | Stripe Checkout on web |
| `plaid` (Node SDK) | Server-side Plaid token exchange |
| `zod` | Shared validation with mobile |

---

## Project Structure

```
subscription-tracker/
├── apps/
│   ├── mobile/          # Expo + React Native
│   │   ├── app/         # Expo Router file-based routes
│   │   ├── components/
│   │   └── hooks/
│   └── web/             # Next.js
│       ├── app/         # App Router pages
│       ├── components/
│       └── api/         # Route handlers (webhooks, OAuth)
├── packages/
│   ├── core/            # Shared types, Zod schemas, API clients
│   └── supabase/        # Supabase client factory, typed DB schema
├── supabase/
│   ├── functions/       # Edge Functions (AI parsing, webhooks)
│   ├── migrations/      # DB schema migrations
│   └── seed.sql
└── package.json         # Workspace root (pnpm workspaces recommended)
```

Use **pnpm workspaces** (not npm or yarn) — better hoisting behavior for React Native's
module resolution, faster installs.

---

## Supabase + React Native Auth Pattern

**Confidence:** HIGH

Use `expo-secure-store` as the storage adapter for the Supabase client — not AsyncStorage.
AsyncStorage is unencrypted and tokens will be visible in device backups.

```typescript
// packages/supabase/client.ts
import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // must be false on native
    },
  }
)
```

**RLS is non-negotiable.** Every table that contains user data must have RLS enabled with
`auth.uid() = user_id` policies. Without this, a bug in your API layer exposes all users'
subscription data to any authenticated request.

---

## Gmail API OAuth — Gotchas

**Confidence:** MEDIUM (based on training data; verify current Google OAuth policies before starting)

### The core problem: Gmail scopes are "sensitive"

Gmail scopes (`gmail.readonly`, `gmail.modify`) are classified as **sensitive or restricted** by Google. This has serious implications:

1. **Verification required for production.** Accessing Gmail data for any app with real users
   requires completing Google's OAuth app verification process. This involves a security
   assessment and can take 4-6 weeks. **Plan for this in your roadmap** — do not treat it
   as a day-one feature.

2. **Testing phase is fine.** While in "Testing" mode (unverified), you can add up to 100
   test users manually in Google Cloud Console. This is sufficient for beta/early access.

3. **"Sign in with Google" is not enough.** You need an additional OAuth consent flow
   specifically to request the Gmail scope. This is a second authorization step beyond
   initial sign-up.

### Mobile OAuth flow (the right way)

Do not implement the Gmail OAuth flow inside the Plaid-style native SDK — Gmail has no
mobile SDK. Use `expo-auth-session` with PKCE:

```
User taps "Connect Gmail"
  → expo-auth-session opens in-app browser
  → Google consent screen (requests gmail.readonly)
  → Redirect to your app's deep link scheme
  → expo-auth-session captures the authorization code
  → App sends code to Supabase Edge Function
  → Edge Function exchanges code for access_token + refresh_token
  → Tokens stored in Supabase (encrypted column or Vault)
  → Edge Function fetches emails, AI parses, returns subscriptions
```

**Never store Gmail OAuth tokens on the device.** They grant access to email. Store them
server-side in Supabase only. The mobile app should never hold a Gmail token — only your
Edge Function should.

### iOS-specific: custom URL scheme vs Universal Links

For the OAuth redirect, use a Universal Link (`https://yourapp.com/oauth/callback`) rather
than a custom URL scheme (`myapp://oauth`). Custom URL schemes can be hijacked by other apps
on the device. For Expo, configure this in `app.json` under `scheme` and ensure your
associated domains are set up.

### The redirect URI consistency problem

Google OAuth is strict: the redirect URI in your authorization request must exactly match
what's registered in Google Cloud Console. In Expo managed workflow, your redirect URI looks
like:
`https://auth.expo.io/@your-expo-username/your-app-slug`

This changes when you move to a custom build. Register both the Expo auth proxy URI (for dev)
and your production Universal Link URI in Google Cloud Console from day one.

---

## Plaid Link SDK — Pitfalls

**Confidence:** MEDIUM (Plaid's SDK moves fast; verify current version before starting)

### Architecture: never call Plaid directly from the app

```
Mobile App → Supabase Edge Function → Plaid API
                                         ↓
Mobile App ← link_token ← Edge Function
  ↓
Plaid Link SDK (opens Plaid's UI)
  ↓
Mobile App receives public_token
  ↓
Mobile App → Supabase Edge Function → Plaid (exchange public_token for access_token)
  ↓
access_token stored in Supabase (server-side only)
```

The `access_token` must never touch the client. The `link_token` is short-lived (30 min)
and safe to send to the app. The `public_token` is also short-lived and must be exchanged
server-side immediately.

### iOS setup requirements

- Add `LSApplicationQueriesSchemes` to `Info.plist` for Plaid's OAuth redirects
- Plaid Link uses an in-app browser (ASWebAuthenticationSession on iOS). This requires the
  app to be in the foreground during the OAuth flow.
- On iOS, Plaid's OAuth banks (e.g., Chase, Wells Fargo) open in the bank's own app or
  Safari. You must configure a Universal Link to receive the return redirect.

### Android setup requirements

- Add `PlaidActivity` to `AndroidManifest.xml`
- Handle `onActivityResult` for the Plaid flow completion
- The React Native Plaid SDK wraps the native Android SDK — keep both in sync (check the
  `react-native-plaid-link-sdk` changelog; major versions sometimes require a native upgrade)

### The "pending OAuth" edge case

When a user selects an OAuth institution (major banks), Plaid redirects them to their bank
app, then back. If the user backgrounds your app during this flow and the OS kills it, the
flow breaks. You must handle the re-entry case: on app resume, check for a pending OAuth
state and resume the Plaid session. The SDK provides a `receivedRedirectUri` prop for this.

### Version pinning

Pin `react-native-plaid-link-sdk` to a specific minor version and test upgrades explicitly.
Plaid has broken React Native compatibility in minor version bumps before. Check their GitHub
releases page before upgrading.

---

## RevenueCat Setup — Patterns

**Confidence:** HIGH (RevenueCat's RN SDK is stable and well-documented)

### Initialization

Initialize RevenueCat as early as possible — in your root `_layout.tsx` before any
navigation renders:

```typescript
// apps/mobile/app/_layout.tsx
import Purchases, { LOG_LEVEL } from 'react-native-purchases'

useEffect(() => {
  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG)
  }
  Purchases.configure({
    apiKey: Platform.select({
      ios: process.env.EXPO_PUBLIC_RC_IOS_KEY!,
      android: process.env.EXPO_PUBLIC_RC_ANDROID_KEY!,
    })!,
  })
}, [])
```

### User identification

When a user signs in via Supabase Auth, immediately identify them to RevenueCat with their
Supabase user ID. This links purchase history to your user record:

```typescript
const { data: { user } } = await supabase.auth.getUser()
if (user) {
  await Purchases.logIn(user.id)
}
```

Call `Purchases.logOut()` on sign-out. If you skip this, purchases get attributed to
anonymous IDs and reconciliation becomes a nightmare.

### Entitlement pattern

Define entitlements in the RevenueCat dashboard (e.g., `pro`). In your app, never gate
features on product IDs — gate on entitlement identifiers:

```typescript
const customerInfo = await Purchases.getCustomerInfo()
const isPro = customerInfo.entitlements.active['pro'] !== undefined
```

Cache this result locally (zustand store) and refresh on app foreground.

### Webhook → Supabase sync

Configure a RevenueCat webhook pointing to a Supabase Edge Function URL. The webhook
fires on purchase, renewal, cancellation, and expiration events. Your Edge Function
updates the `user_entitlements` table. This is the source of truth for the web version —
the web app reads from Supabase, not from RevenueCat directly.

```
RevenueCat webhook → POST /functions/v1/revenuecat-webhook
  → verify webhook signature (RevenueCat sends a shared secret header)
  → upsert into user_entitlements table
  → return 200
```

### Sandbox testing

Use StoreKit sandbox accounts (iOS) and Google Play test purchases (Android) during
development. RevenueCat's dashboard has a sandbox/production toggle. Test the full
purchase → webhook → Supabase flow in sandbox before going to production.

### Expo managed workflow note

`react-native-purchases` requires native modules. In Expo managed workflow, this means
you need an **Expo Development Build** (not Expo Go). Add `react-native-purchases` to
your `app.json` plugins and run `eas build --profile development`. Expo Go will not work
for RevenueCat or Plaid.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Mobile framework | React Native + Expo | Flutter | Plaid has no first-party Flutter SDK; Flutter Web has accessibility/SEO gaps |
| Mobile framework | React Native + Expo | Bare React Native | Expo eliminates native build complexity for solo dev; EAS handles CI/CD |
| Auth | Supabase Auth | Firebase Auth | Already using Supabase; Firebase adds a second vendor for no gain |
| State management | Zustand + TanStack Query | Redux | Redux overhead not justified for this app size |
| Monorepo tooling | pnpm workspaces | Turborepo | Turborepo adds value at larger scale; pnpm workspaces alone are sufficient here |
| Web styling | Tailwind CSS | CSS Modules | Tailwind's utility classes are faster for solo iteration |
| Gmail parsing | Server-side Edge Function | Client-side parsing | Client-side would require storing Gmail tokens on device — security risk |

---

## Installation Sketch

```bash
# Monorepo init
mkdir subscription-tracker && cd subscription-tracker
pnpm init

# Mobile app
npx create-expo-app apps/mobile --template blank-typescript
cd apps/mobile
pnpm add @supabase/supabase-js expo-secure-store expo-auth-session \
  react-native-purchases react-native-plaid-link-sdk \
  @tanstack/react-query zustand zod

# Web app
npx create-next-app apps/web --typescript --tailwind --app

# Shared packages
mkdir -p packages/core packages/supabase

# Supabase CLI (already installed via Homebrew)
supabase init
supabase start
```

---

## Open Questions to Validate Before Starting

1. **Gmail verification timeline:** Check current Google OAuth verification SLA. If it's
   longer than your MVP window, ship without Gmail first and use manual subscription entry.

2. **Plaid SDK version compatibility:** Check current `react-native-plaid-link-sdk` version
   against your Expo SDK version before starting. They have had breaking changes at SDK
   boundaries.

3. **RevenueCat + Expo SDK 51+ compatibility:** Verify `react-native-purchases` supports your
   exact Expo SDK version. Check the RevenueCat GitHub for open Expo-related issues.

4. **Supabase Edge Function cold start:** For AI parsing triggered by webhook (email arrives),
   test cold start latency. If >3s, consider moving AI parsing to a dedicated async queue
   (Supabase `pg_cron` or an external queue).

5. **Plaid sandbox access:** Plaid requires account approval even for sandbox. Apply early —
   it can take a few business days.

---

## Confidence Summary

| Area | Confidence | Basis |
|------|------------|-------|
| RN vs Flutter decision | HIGH | Plaid's first-party SDK support is a documented fact |
| Expo + Supabase pattern | HIGH | Well-established pattern with many public examples |
| RevenueCat RN setup | HIGH | SDK is stable, docs are thorough, pattern is widely used |
| Gmail OAuth gotchas | MEDIUM | Verification policy and scope restrictions are real; exact timelines may vary |
| Plaid RN integration | MEDIUM | Architecture is correct; SDK version specifics need live verification |
| Supabase Edge Functions for AI | HIGH | Standard Supabase pattern; Deno runtime is stable |

---

## Sources

All findings from training data (cutoff August 2025). External search tools were unavailable
during this research session.

Authoritative URLs to verify before starting each phase:
- RevenueCat RN docs: https://www.revenuecat.com/docs/getting-started/installation/reactnative
- Plaid RN SDK: https://github.com/plaid/react-native-plaid-link-sdk
- Plaid Link docs: https://plaid.com/docs/link/react-native/
- Supabase + Expo guide: https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native
- Gmail OAuth scopes: https://developers.google.com/gmail/api/auth/scopes
- Google OAuth verification: https://support.google.com/cloud/answer/9110914
- expo-auth-session: https://docs.expo.dev/versions/latest/sdk/auth-session/
- RevenueCat webhooks: https://www.revenuecat.com/docs/integrations/webhooks
