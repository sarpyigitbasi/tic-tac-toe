# Domain Pitfalls: SubTrackr

**Domain:** AI-powered subscription tracker — Gmail + Plaid + AI parsing
**Researched:** 2026-04-04
**Confidence note:** Web search tools unavailable in this session. Findings drawn from training knowledge (cutoff August 2025) on stable, well-documented policy areas (Google OAuth policies, Plaid docs, App Store guidelines, GDPR/CCPA). Regulatory requirements in this domain change slowly — but you MUST verify current specifics against live documentation before going to production.

---

## 1. Gmail API — OAuth Verification Process

### Pitfall: Underestimating the Verification Timeline

**What goes wrong:** Developers assume Gmail OAuth is just a Google Cloud Console toggle. In reality, apps requesting sensitive or restricted Gmail scopes must pass a formal Google verification review before unverified users can grant access. Without verification, any user who tries to connect Gmail sees a scary "This app isn't verified" interstitial with an option to go back — most users will not proceed.

**The scopes that trigger this for SubTrackr:**
- `https://www.googleapis.com/auth/gmail.readonly` — classified as a **sensitive scope**, requires Google verification
- `https://www.googleapis.com/auth/gmail.metadata` — lower risk, may not require full verification but still requires a published privacy policy

**Verification tiers:**
1. **Unverified (testing mode):** Up to 100 test users can connect. Fine for development and private beta. Users see a warning but can proceed. This is where you start.
2. **Sensitive scope verification:** Requires submitting an application, a privacy policy URL, a demo video showing exactly how Gmail data is used, and passing Google's review. Timeline is typically **4–6 weeks**, but can be longer if Google requests revisions. There is no fast-track.
3. **Restricted scope verification (not applicable here):** Full security audit by a Google-approved third party. Required for scopes like `gmail.modify`. Do NOT request these scopes.

**Why it happens:** Google's 2018/2019 policy tightening after Cambridge Analytica made all email-reading apps go through manual review.

**Consequences if ignored:** You cannot launch to more than 100 users with Gmail connection. Attempting to work around this (e.g., requesting a lower-privileged scope that doesn't actually meet your needs) will get your app rejected or revoked.

**Prevention:**
- Start the verification application **at least 6–8 weeks before intended launch**
- Use only `gmail.readonly` — do not request broader scopes
- Record a clear demo video: show the OAuth flow, show what data is read, show how subscriptions are detected, show that no email content is stored raw
- Write a plain-English privacy policy that explicitly describes Gmail data usage before submitting
- Keep test users (up to 100) for the entire beta period — do not need verification for this

**Detection (warning signs):**
- You haven't submitted verification and your launch is within 6 weeks
- Your privacy policy doesn't mention Gmail data specifically
- Your demo video shows more data being processed than your stated use case

**Confidence: HIGH** — This is Google's published policy, stable since 2019.

---

### Pitfall: Requesting the Wrong Scope Entirely

**What goes wrong:** The `gmail.readonly` scope gives access to the full content of every email. Google may flag your verification application if your demo doesn't justify needing full email bodies. Some apps can use `gmail.metadata` (only headers — From, Subject, Date) which is less sensitive and may pass review more easily.

**Prevention:** Evaluate whether subscription detection can work from metadata only (Subject line + sender) for most cases, with `gmail.readonly` as an upgrade. This two-tier approach is harder to build but significantly easier to get approved.

---

## 2. Plaid — Compliance Requirements Before Going Live

### Pitfall: Assuming Plaid is "Plug and Play" for Production

**What goes wrong:** The Plaid Sandbox works immediately with no compliance steps. Production access requires a separate application, agreement review, and sometimes a business review call with Plaid's team. Developers don't discover this until they're ready to ship.

**What Plaid requires before production access:**
1. **Plaid Developer Agreement** — must be signed. Includes data use restrictions, prohibition on selling transaction data, and requirements around data deletion on user request.
2. **Privacy Policy** — must be live and must explicitly describe Plaid's role as a data intermediary. Plaid's own legal page provides required disclosure language.
3. **Use-case review** — Plaid classifies apps by use case. "Personal finance / subscription tracking" is generally allowed, but you must accurately describe your use case during signup. Misrepresenting use case (e.g., claiming you're a lending app to get different pricing) voids the agreement.
4. **Terms of Service** — your app's ToS must include a section on Plaid that links to Plaid's End User Privacy Policy.
5. **Webhook endpoint** — production requires a live, HTTPS webhook URL before they'll approve the account. Can't use localhost.

**Timeline:** Production access application review typically takes **3–10 business days** for standard personal finance apps. Not as long as Gmail, but still non-trivial.

**Pricing reality check:**
- Plaid charges per Item (bank connection), not per API call
- Approximately $0.30–$0.50 per connected account per month in production (varies by plan and volume)
- For a free tier that lets users connect a bank account, you absorb this cost for every free user — this cost must be modeled before launch

**Confidence: HIGH (pricing approximate, structure HIGH)**

---

### Pitfall: Plaid Token Lifecycle Mismanagement

**What goes wrong:** Plaid access tokens do not expire on a fixed schedule, but they DO become invalid when:
- The user revokes access at their bank (out-of-band, Plaid has no webhook for this in all cases)
- The institution has an outage or maintenance window
- The institution changes their authentication flow (forces re-authentication)
- Plaid rotates credentials for compliance reasons

If your backend tries to use an invalid access token, Plaid returns an `ITEM_LOGIN_REQUIRED` error. Apps that don't handle this gracefully will silently stop syncing bank data with no user-visible indication.

**Prevention:**
- Implement webhook handling for `ITEM_LOGIN_REQUIRED`, `PENDING_EXPIRATION`, and `USER_PERMISSION_REVOKED` events from day one
- When these events are received, send the user a push notification and surface an in-app "Reconnect your bank" prompt using Plaid Link in update mode
- Never assume a stored access token is valid — always handle the error case on every API call
- Store `item_id` alongside `access_token` — you need both for webhook correlation

**Detection (warning signs):**
- Your Plaid webhook handler is a stub or TODO
- You have no "bank disconnected" state in your UI
- Users report their subscriptions stopped updating without any notification

**Confidence: HIGH** — This is Plaid's documented behavior, well-known in the developer community.

---

### Pitfall: Institution Outages Are Common and Unpredictable

**What goes wrong:** Major banks (Chase, Bank of America, Wells Fargo) have frequent partial outages with Plaid. These are not your fault, but users will blame your app. Plaid's status page shows outages for specific institutions.

**Prevention:**
- Show a "last synced" timestamp on the bank connection UI — never show stale data as current
- Display institution-specific status if Plaid provides it
- Do not show error states aggressively — a single failed sync attempt should retry silently; only surface an error after 2–3 consecutive failures
- Consider Plaid's `transactions/refresh` endpoint to trigger a manual re-fetch when users pull-to-refresh

---

## 3. Privacy and Data Handling — GDPR, CCPA, and Financial Data

### Pitfall: Treating Email + Bank Data as Normal App Data

**What goes wrong:** Standard mobile app privacy practices (e.g., a generic "we collect usage data" policy) are wildly insufficient for an app that reads email content and financial transactions. Regulators and App Store reviewers treat this category differently.

**GDPR requirements (if you have any EU users):**
- **Legal basis for processing:** Reading Gmail and bank transactions requires explicit, granular user consent as the legal basis. "By using the app you agree" buried in ToS is not sufficient — it must be a specific, affirmative consent action.
- **Data minimization:** You must only process data necessary for the stated purpose. If you read a full email to extract a subscription amount, you cannot store the raw email body — only the extracted structured data.
- **Right to deletion:** Users must be able to delete their account and have ALL associated data (including derived subscription data) deleted within 30 days. This must actually work — not just delete the user row.
- **Data Processing Agreements (DPAs):** You need DPAs with Supabase, Plaid, Anthropic/OpenAI, and RevenueCat. Most of these vendors have standard DPAs — you must sign them.
- **Privacy Policy:** Must be available before download (in App Store listing), before account creation, and before any data is collected.

**CCPA requirements (if you have California users — you will):**
- Must disclose what data is collected, why, and whether it is "sold" (it won't be, but must be stated)
- Must provide a "Do Not Sell My Personal Information" link or equivalent mechanism
- Must honor deletion requests within 45 days

**Key rule on AI processing:**
- If you send email content or bank transaction descriptions to Claude/OpenAI, you are sharing that data with a third party
- This must be disclosed in your privacy policy: "We use [Anthropic/OpenAI] to analyze your data. Your data may be processed on their servers."
- Anthropic's API Terms and OpenAI's API Terms prohibit training on API-submitted data (with opt-in exceptions), but you must verify this is current and include it in your policy

**Prevention:**
- Write the privacy policy before building, not after
- Model your data flow explicitly: what data flows to Supabase, what goes to Plaid, what goes to Claude/OpenAI — document each hop
- Implement data deletion as a first-class feature, not an afterthought
- Only store structured extracted data (service name, amount, date, frequency) — never store raw email bodies or raw transaction descriptions beyond the immediate processing window
- Consult a lawyer specializing in privacy law before launch if you have budget — this is an area where mistakes are expensive

**Confidence: HIGH for requirements, MEDIUM for specific thresholds (employee count exemptions, etc.)**

---

### Pitfall: Sending Raw Financial/Email Data to AI APIs Without Data Minimization

**What goes wrong:** The naive implementation sends the full email body or the full 90-day transaction history to Claude/OpenAI in one prompt. This creates unnecessary data exposure, increases AI processing costs, and may violate data minimization principles.

**Prevention:**
- Pre-filter emails server-side before sending to AI: only pass emails where the Subject or From field matches known subscription patterns (receipts, billing, etc.)
- For bank transactions: strip identifying information (last 4 digits of card, partial account numbers) before sending the description to AI
- Use structured prompts that ask the AI to extract specific fields rather than sending raw data with open-ended analysis
- Log what you send to AI APIs — you need this for debugging AND for data processing records

---

## 4. App Store and Play Store — Financial Data App Policies

### Pitfall: App Store Review Rejection Due to Financial Data Handling

**What goes wrong:** Apple and Google both apply heightened scrutiny to apps that access financial data. Rejections in this category are common and can delay launch by weeks.

**Apple App Store — specific requirements:**
- **Privacy Nutrition Labels:** Must accurately declare all data types collected. "Financial Info" is a category — transaction data collected from Plaid must be declared. Email content read from Gmail must be declared under "Email or Text Messages" and/or "Other Data."
- **App Privacy Report:** Must match what the app actually does — Apple uses automated analysis and will catch mismatches
- **Guideline 5.1.1 (Data Collection and Storage):** Apps must only request data necessary for the core use case. Requesting Gmail and Plaid access but only showing 3 subscriptions in a demo may trigger a reviewer question about why both are needed
- **Guideline 2.1 (App Completeness):** App submitted for review must be fully functional with real backend — cannot submit with mock/demo data. Reviewers will actually connect Gmail and/or a test bank account
- **Sign in with Apple:** If you offer any third-party login (even Gmail OAuth), Apple requires you to ALSO offer Sign in with Apple as an option. This applies to the authentication flow, not the Gmail data connection — but be aware of it

**Google Play Store — specific requirements:**
- **Sensitive Permissions Declaration:** Gmail access requires declaration under "Prominent disclosure" rules. You must show a prominent in-app disclosure (a dialog or screen, not just ToS text) before the OAuth flow
- **Data Safety section:** Must accurately declare all data collected, whether it's shared with third parties, and whether it's encrypted in transit and at rest
- **Financial apps policy:** Apps accessing financial account information must be approved under Google's Financial Services policy. In some regions this requires demonstrating regulatory compliance (e.g., FCA in the UK, ASIC in Australia)

**Mitigation strategies:**
- Submit to App Store review with a test Gmail account AND a Plaid Sandbox account ready for reviewers to use — provide these credentials in the "Notes for App Review" field
- Screenshot every screen of the privacy consent flow and include it in review notes
- Use the minimum necessary permissions — if you can detect 80% of subscriptions without reading email bodies, do that for the initial submission, then expand later
- Have a complete, published privacy policy URL in the App Store listing before submission — this is a hard requirement

**Confidence: HIGH for Apple requirements, HIGH for Play requirements**

---

### Pitfall: Forgetting Prominent Disclosure Before Gmail OAuth

**What goes wrong:** Google Play's prominent disclosure policy requires a full-screen or near-full-screen disclosure explaining what Gmail data you access and why, presented BEFORE the OAuth consent screen. This is separate from the OAuth flow itself and is required in-app. Apps without it fail review and can be removed post-launch.

**Required elements of the disclosure:**
1. What data is accessed ("your Gmail inbox")
2. Why it is accessed ("to detect subscription emails")
3. How it is used ("to identify and display your active subscriptions")
4. Confirmation that it is not used for other purposes

This also applies to iOS App Store review expectations even if not identically worded in guidelines.

---

## 5. Plaid Integration — Common Failure Modes

### Pitfall: Plaid Link SDK Version Drift

**What goes wrong:** Plaid releases Link SDK updates frequently (monthly or more). Older versions of the SDK break when Plaid retires their support. On React Native and Flutter especially, Plaid Link has had significant breaking changes. Teams that integrate once and don't maintain it discover their bank connection flow silently fails months later.

**Prevention:**
- Pin Plaid SDK versions but subscribe to Plaid's changelog and developer newsletter
- Test the Plaid Link flow on every release of your app, not just when you touch Plaid-related code
- Build a canary test (connect a test institution in Plaid Sandbox) into your CI/CD pipeline

---

### Pitfall: Assuming Transaction Data is Complete and Real-Time

**What goes wrong:** Plaid transaction sync has variable latency by institution. Some institutions update within hours; others have 24–72 hour delays. Many institutions only provide 90 days of historical transactions by default. Some provide fewer.

**Specific known issues:**
- Credit cards often have pending transactions that later get modified or deleted when they settle
- Pending transaction amounts can differ from settled amounts (subscriptions are usually exact, but not always)
- Some prepaid and neobank accounts (Chime, Current, etc.) have inconsistent Plaid support
- Plaid's `transactions/sync` endpoint is the current recommended approach (replaces the deprecated `transactions/get`)

**Prevention:**
- Use `transactions/sync` not `transactions/get`
- Handle pending transaction states — don't display a subscription as "confirmed" if it's based on a pending transaction
- Show the historical data coverage date range so users understand why something might be missing
- Do not tell users they have "all your subscriptions" — say "subscriptions found in your connected accounts"

---

### Pitfall: Access Token Storage Security

**What goes wrong:** Plaid access tokens are long-lived credentials that give read access to a user's bank account. Storing them incorrectly (e.g., in a client-accessible column without row-level security, or in plain text logs) is a serious security failure.

**Prevention:**
- Store Plaid access tokens in Supabase with strict row-level security (only accessible by your backend service role, never by the client)
- Never log access tokens — use token masking in any log output
- Encrypt access tokens at rest if your database doesn't do this natively (Supabase uses AES-256 at rest, verify this is enabled)
- Implement access token revocation as part of your "disconnect bank" flow — call Plaid's `item/remove` endpoint, don't just delete the row

---

## 6. AI Parsing Reliability — False Positives and Misidentification

### Pitfall: Treating AI Output as Ground Truth

**What goes wrong:** Claude and GPT-4 are very good at identifying subscription patterns but are not perfect. Common failure modes:
- **One-time charges identified as recurring:** A single large purchase from an annual subscription you cancelled 2 years ago gets flagged as active
- **Recurring non-subscriptions:** Gym membership direct debits, insurance payments, mortgage payments — these are "subscriptions" in the financial sense but not what users expect to see
- **Amount variation:** Subscriptions with variable billing (usage-based SaaS, mobile data overages) get identified with wrong amounts
- **Duplicate detection:** Same subscription found in both Gmail and bank data, displayed twice
- **Service name normalization failures:** "AMZN PRIME*RF5K9" maps to "Amazon Prime" correctly, but "NFLX" and "Netflix" and "NETFLIX.COM" might be treated as three different services

**Prevention — Design level:**
- The "confirm or dismiss" flow (AIDET-04, AIDET-05) is the correct architecture — never auto-add a subscription without user confirmation
- Show the source evidence alongside the detected subscription: the email subject line or transaction description that triggered the detection, so users can evaluate the AI's reasoning
- Implement confidence thresholds: if the AI is uncertain, present the item differently ("We think this might be a subscription — is it?") rather than as a confirmed detection

**Prevention — Prompt engineering level:**
- Give the AI explicit exclusion rules: "Do NOT flag one-time purchases, gift cards, or non-subscription charges even if recurring"
- Provide a structured output schema (JSON) rather than free text — this dramatically reduces hallucination and parsing errors
- Include a confidence field in the schema (0.0–1.0) and threshold below which items go to a "needs review" bucket
- Version control your prompts as code — prompt changes are feature changes and affect output quality the same way code changes do

**Prevention — Data architecture level:**
- Deduplicate before presenting: hash the normalized service name + amount + billing period as a key before insertion; reject duplicates
- Keep a log of AI decisions (input fingerprint + output) for debugging without storing PII — this is essential for improving the prompt over time

**Confidence: HIGH** — These failure modes are well-documented across production AI parsing systems.

---

### Pitfall: AI API Costs Scale Unexpectedly

**What goes wrong:** Processing 90 days of email + 90 days of transactions for every new user is expensive. A user with an active inbox might have 5,000+ emails. Even with pre-filtering, sending 100–200 relevant emails through Claude at $3–15/million tokens adds up quickly.

**Realistic cost estimate:**
- Average pre-filtered email set: ~50–100 emails per user
- Average email body (with HTML stripped): ~500–2,000 tokens
- At 100 emails x 1,000 tokens average = 100K tokens per user onboarding
- Claude Sonnet at ~$3/million input tokens = $0.30 per user onboarding scan
- At 1,000 new users/month = $300/month in AI costs for onboarding alone
- Ongoing monthly scans for active users add to this

**Prevention:**
- Pre-filter aggressively server-side before sending to AI: only process emails where the sender domain matches a known subscription domain list, or where the Subject contains keywords (receipt, invoice, subscription, renewal, billing)
- Use cheaper AI models (Claude Haiku, GPT-4o-mini) for the initial filtering pass, reserve Sonnet/GPT-4o for ambiguous cases
- Batch transaction descriptions into a single prompt rather than one prompt per transaction
- Model per-user AI cost into your paid tier pricing — if paid users use 10x more AI processing, your margins must reflect that

---

## 7. Cross-Cutting Risks

### Pitfall: Building Gmail + Plaid + AI All at Once

**What goes wrong:** Teams try to integrate all three data sources simultaneously and can't isolate bugs. When a subscription isn't detected, it's unclear whether the Gmail OAuth flow failed, the email wasn't processed, the AI missed it, the data wasn't stored, or the UI isn't showing it.

**Prevention:**
- Build and fully test Gmail integration independently before adding Plaid
- Build and fully test Plaid independently
- Build AI parsing against static fixture data (captured real emails and transactions, anonymized) before connecting it to live integrations
- Each integration should have an observable pipeline — log each step: "email fetched," "email sent to AI," "subscription extracted," "subscription saved"

---

### Pitfall: No Fallback When Integrations Are Down

**What goes wrong:** Your app's core value proposition requires Gmail and/or Plaid to function. If either is down or a user's connection is broken, the app appears broken even though it's not your fault.

**Prevention:**
- Manual subscription entry must work perfectly from day one — this is the fallback for all users whose integrations fail
- Show clear, non-alarming status when an integration is unavailable: "Bank sync paused — tap to reconnect" not a generic error
- Consider a grace period: if bank sync fails, show the last known data with a timestamp rather than showing nothing

---

## Phase-Specific Warnings

| Phase | Topic | Likely Pitfall | Mitigation |
|-------|-------|---------------|------------|
| Phase 2 | Gmail OAuth integration | Verification timeline blocks launch | Start verification application in Phase 2, not Phase 5 |
| Phase 2 | Plaid production access | Review takes 1–2 weeks, can't test production until approved | Apply for production access in parallel with development |
| Phase 2 | Prominent disclosure UI | Missing from Gmail + Plaid OAuth flows triggers rejection | Build the disclosure screen before the OAuth screen |
| Phase 3 | AI prompt design | False positives frustrate beta users | Build confirm/dismiss flow before connecting to real data |
| Phase 3 | AI cost modeling | Onboarding cost per user not modeled | Log token usage from day one, set alerts |
| Phase 4 | Data deletion | "Delete account" doesn't actually delete data | Implement full cascade delete including Plaid item removal |
| Phase 5 | App Store submission | Reviewer needs working credentials | Prepare test Gmail + Plaid Sandbox credentials for review notes |
| Phase 6 | Privacy policy completeness | Policy doesn't cover AI processing or Plaid's role | Legal review of privacy policy before App Store submission |

---

## Critical Actions Before Launch (Ordered by Lead Time)

1. **Start Google OAuth verification immediately** when Gmail integration is functional (not at launch) — 4–8 week lead time
2. **Apply for Plaid production access** when Plaid Sandbox integration is stable — 1–2 week lead time
3. **Write the privacy policy** before submitting either of the above — required by both
4. **Sign Plaid's DPA** and Supabase's DPA, Anthropic's or OpenAI's data processing terms
5. **Model AI costs** at 1K, 10K, and 100K users before setting pricing

---

## Sources

**Confidence levels:**
- Gmail OAuth verification process, scope classifications: HIGH (Google's published policy, stable since 2019; verify current timeline at https://support.google.com/cloud/answer/9110914)
- Plaid production requirements and token lifecycle: HIGH (Plaid's documented API behavior; verify current checklist at https://plaid.com/docs/launch-checklist/)
- GDPR/CCPA requirements: HIGH for structure, MEDIUM for specific thresholds
- App Store/Play Store financial app policies: HIGH (Apple App Store guidelines 5.1.1, 2.1; Google Play Prominent Disclosure policy)
- Plaid failure modes (institution outages, token expiry): HIGH (well-documented developer community knowledge)
- AI parsing failure modes: HIGH (observable in production AI systems)
- AI cost estimates: MEDIUM (based on published model pricing as of mid-2025; verify current pricing before modeling)

**Verify before launch:**
- https://support.google.com/cloud/answer/9110914 — current Gmail API verification requirements
- https://plaid.com/docs/launch-checklist/ — current Plaid production checklist
- https://plaid.com/legal/privacy-statement/ — required disclosure language for your ToS
- https://developer.apple.com/app-store/review/guidelines/ — current App Store guidelines
- https://support.google.com/googleplay/android-developer/answer/9888076 — Play Store prominent disclosure
