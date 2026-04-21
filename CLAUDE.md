@AGENTS.md

# throws.gg — Virtual Horse Racing Betting Platform

## What this is

A crypto-native virtual horse racing betting platform. Users deposit USDC/SOL via Privy embedded wallets, bet on virtual horse races with fixed odds (16 persistent horses, 8 per race), and withdraw winnings. We are the house. ~9% house edge via 1.10 overround (category norm for virtual sports is 8–15%). 480 races/day (one every 3 minutes). Provably fair via HMAC-SHA256.

**House edge policy:** We don't headline the exact overround in marketing copy, but we don't hide it either — the simulation is deterministic and users can sum implied probabilities on `/api/race/state` or verify outcomes via `/verify`. If asked: "Yes, ~9% overround — industry-standard for virtual sports. We aim to lower it as bankroll and volume grow." Never deny it. Never raise it silently — if it changes, announce it.

**Market positioning:** We are in the **virtual sports / virtual horse racing** category — NOT "AI horse racing". In all outbound copy (job posts, affiliate outreach, marketing, UI), lead with "virtual horse racing" or "virtual sports" — never "AI horse racing". Virtual sports is an established iGaming category that affiliates and users already understand.

**Domain:** throws.gg
**Owner:** Connor — solo founder, vibe coder, uses Claude as the dev partner. Claude builds everything.
**Launch target:** Early May 2026 (~2 weeks from now). Horse racing is the flagship product. No RPS at launch.
**Bankroll:** $10K USD. Max bet $100. Max race liability 8% of bankroll per horse.

## Tech stack

- **Framework:** Next.js 16.2.1 (App Router) + React 19 + TypeScript
- **Database:** Supabase (Postgres + Realtime) — LIVE production project at nacxrrgqodaoudaqrknf.supabase.co
- **Auth:** Privy (embedded wallets + social login + email)
- **Blockchain:** Solana — USDC-SPL deposits/withdrawals via Privy embedded wallets
- **State:** Zustand
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Animations:** Framer Motion + HTML Canvas (race animation)
- **AI Commentary:** Anthropic Claude API (post-race summaries — ANTHROPIC_API_KEY currently empty in .env.local)
- **Analytics:** PostHog (client + server-side, installed and initialised)
- **Hosting:** Vercel (vercel.json has crons for race tick, affiliate tiers, affiliate payouts)
- **Hot wallet:** Funded with USDC on Solana. Withdrawals NOT yet tested on mainnet — must test before launch (see checklist below).

## Project structure

```
rps/
  app/
    page.tsx                        # Landing page (726 lines). Two modes: waitlist (default) or live (NEXT_PUBLIC_IS_LIVE=true)
    layout.tsx                      # Root layout with Providers
    globals.css                     # Dark theme, brand colours
    (game)/
      racing/page.tsx               # Main racing page — bet, watch, results
      arena/page.tsx                # RPS game (not launching with this)
      leaderboard/page.tsx          # Leaderboard
      history/page.tsx              # Bet history
      verify/page.tsx               # Provably fair verification
    (account)/
      wallet/page.tsx               # Deposit + withdraw
      profile/page.tsx              # User profile
      settings/page.tsx             # User settings
      referrals/page.tsx            # Referral dashboard
    (admin)/admin/
      dashboard/page.tsx            # Admin stats (volume, GGR, edge, users)
      users/page.tsx                # User management (ban, mute, search)
      races/page.tsx                # Race monitoring
      affiliates/page.tsx           # Affiliate review + management
      payouts/page.tsx              # Payout management
      transactions/page.tsx         # Transaction ledger
      big-wins/page.tsx             # Big win alerts
      chat/page.tsx                 # Chat moderation
      control/page.tsx              # Emergency controls (pause races)
      banner/page.tsx               # Site banner management
    terms/page.tsx                  # Terms of Service (static)
    responsible-gambling/page.tsx   # Responsible gambling resources + self-exclusion info (static)
    affiliates/page.tsx             # Public affiliate application
    r/[code]/page.tsx               # Referral link handler
    [vanitySlug]/page.tsx           # Affiliate vanity URLs
    api/
      race/tick/route.ts            # Cron: advances race state machine (every minute via Vercel cron)
      race/state/route.ts           # GET current race state for frontend polling
      race/bet/route.ts             # POST place a bet
      race/bet/history/route.ts     # GET user's race bet history
      race/bet/cancel/route.ts      # POST cancel a pending bet
      race/horses/route.ts          # GET all horses with stats
      race/verify/route.ts          # GET provably fair verification
      wallet/deposit/route.ts       # POST check for new on-chain deposits
      wallet/withdraw/route.ts      # POST request withdrawal
      auth/sync/route.ts            # POST bridge Privy JWT -> DB user
      chat/send/route.ts            # POST send chat message
      user/me/route.ts              # GET current user
      (+ 18 admin endpoints, affiliate endpoints, cron jobs)
  lib/
    racing/
      engine.ts                     # Race state machine: create -> close -> run -> settle -> next
      simulation.ts                 # Deterministic race sim (power score model, HMAC-based RNG)
      odds-engine.ts                # Monte Carlo odds calculation (4000 iterations, overround)
      commentary.ts                 # AI post-race commentary via Anthropic API
      constants.ts                  # Types, timing, horse identities, sprite mappings, bankroll limits
      provably-fair-browser.ts      # Client-side race verification
    game/
      engine.ts                     # RPS engine (not used at launch)
      provably-fair.ts              # HMAC-SHA256 seed system (shared by racing)
      provably-fair-browser.ts      # Browser verification
      constants.ts                  # RPS constants
    auth/
      privy.ts                      # Privy server SDK, JWT verification
      verify-request.ts             # Auth middleware: verifies Privy JWT, looks up DB user
      auth-context.tsx              # React auth context
      verify-admin.ts               # Admin auth (password-based)
    wallet/
      solana.ts                     # Solana connection, USDC mint address
      send-usdc.ts                  # Send USDC from hot wallet for withdrawals
    supabase/
      client.ts, admin.ts, server.ts
    chat/system-messages.ts
    analytics/posthog.ts, posthog-server.ts
  components/
    racing/
      RaceCanvas.tsx                # HTML Canvas race animation with horse sprites
      HorseSprite.tsx               # Individual horse sprite renderer
      RaceWinCard.tsx               # Shareable win card (html-to-image)
      PodiumResults.tsx             # Results-phase podium: 1st centered/elevated, 2nd left, 3rd right + fake "total won" pot
    game/ (RPS components — not used at launch)
    chat/ChatFeed.tsx, ChatTicker.tsx
    wallet/DepositPanel.tsx, WithdrawPanel.tsx
    layout/Navbar.tsx, MobileNav.tsx, Providers.tsx
    ui/ (shadcn components)
  stores/
    userStore.ts, raceStore.ts, chatStore.ts
  hooks/
    useChat.ts, useAuthedFetch.ts, useSound.ts
  supabase/migrations/
    001-017                         # 19 migration files, ~2200 lines SQL
  public/horses/                    # Horse sprite sheets (bodies, hair, face markings)
```

## Database schema (key tables)

- **users** — balance, total_wagered, total_profit, role, is_banned, referrer_id, is_affiliate
- **horses** — 16 persistent horses with speed/stamina/form/consistency/ground_preference, career stats, last_5_results, distance/ground/gate records
- **races** — race_number, status (betting/closed/racing/settled), distance, ground, server_seed, timing fields, financials
- **race_entries** — horse_id + race_id, gate_position, opening_odds, current_odds, true_probability, finish_position, power_score, snapshot_form
- **race_bets** — user_id, race_id, horse_id, amount, locked_odds, potential_payout, status (pending/won/lost/cancelled), bet_type (win/place/show)
- **transactions** — full audit trail (deposit/withdrawal/bet/payout/push_refund/bonus)
- **chat_messages** — real-time chat with system messages for race events
- **referrals** — referrer_id, referred_id, status, reward tracking
- **affiliate_applications** — public signup flow with admin review
- **affiliate_periods** — weekly earnings periods with holds/claimable/paid states

Key SQL functions: `update_balance()` (atomic), `place_race_bet_atomic()`, `settle_race()`, `accrue_referral_reward()`, `accrue_simple_referral_reward()`

## Race cycle (3 minutes)

```
[0:00 - 1:30]   BETTING — 90 seconds. Users see race card, place bets
[1:30 - 1:45]   CLOSED — 15 seconds. "Horses to gates"
[1:45 - 2:05]   RACING — 20 seconds. Canvas animation plays
[2:05 - 2:20]   RESULTS — 15 seconds. Finishing order, payouts, commentary
                 Then immediately creates next race
```

Driven by Vercel cron hitting `/api/race/tick` every minute. The tick function checks timestamps and advances the state machine. Multiple ticks per cycle are safe (idempotent transitions).

## What is DONE and working

- Race engine: create, close, simulate, settle — full lifecycle
- Provably fair: HMAC-SHA256 seeds, deterministic simulation, verification endpoint
- 16 horses with sprites, identities, career stat tracking, form updates after each race
- Monte Carlo odds engine (4000 iterations, overround, place/show odds)
- Bet placement with atomic balance deduction, liability caps, odds locking
- Settlement with payouts, house profit tracking, referral reward accrual
- Race animation on HTML Canvas with horse sprites and gallop frames
- Privy auth with JWT verification on all API routes
- Deposit flow (checks on-chain USDC/SOL balance vs baseline, auto-credits)
- Withdrawal flow (auto-send <=100, hold >=100 for admin review, rate limited, refund on failure) — **tested on mainnet April 2026, works end-to-end**
- Chat with Supabase Realtime, system messages for race events + big wins
- Admin panel (14 pages: dashboard, users, races, affiliates, payouts, transactions, chat, control)
- Affiliate system: 2-tier (regular referral **20% NGR lifetime** + approved affiliate 35-45% tiered NGR)
- PostHog analytics: race_completed, bet_settled events with user properties
- Referral link tracking, vanity slugs, affiliate application flow
- AI commentary generation via Anthropic API (needs API key set)
- Terms of Service page at /terms
- Responsible Gambling page at /responsible-gambling (self-exclusion info, deposit limits, helplines)
- Landing page with two modes: waitlist (default) and live (NEXT_PUBLIC_IS_LIVE=true)
- Footer links to /terms, /responsible-gambling, /verify, /affiliates
- Podium results screen (PodiumResults.tsx) — shows 1st elevated centre, 2nd below-left, 3rd below-right with horse sprite idle animation, gold/silver/bronze metallic rings, serif Roman numerals, fake "TOTAL WON THIS RACE" pot ($313.57–$1688.71 across 8–84 winning tickets, seeded off race id so it's stable per race). Replaces the race-card list during isResults. One-shot gold embers + sheen — no looping shake.
- Editable usernames — pencil icon in `/profile` opens inline modal, 3-20 chars `[a-z0-9_]`, reserved-word check, case-insensitive uniqueness, 7-day cooldown. API at `/api/user/username`, cooldown tracked via `users.username_changed_at`.
- Referral link card on `/profile` — shows `throws.gg/r/CODE` with Copy + Share on X, links to full `/referrals` page. Uses `referralCode` from userStore (populated by `/api/auth/sync`).
- Admin vanity affiliate links — `/admin/affiliates` "Custom Links" tab creates slugs like `throws.gg/drake` mapped to a username. Case-insensitive + @-prefix-tolerant lookup, copy-link action per row. Auth via `verifyAdmin` (password cookie), NOT users.role.
- Bonus-abuse hole plugged — `race_bets.from_bonus_amount` tracks the bonus portion of each stake; `settle_race` routes payouts proportionally: bonus-funded wins → `bonus_balance` (stays locked), cash-funded wins → `balance`. When `wagering_remaining` hits 0, full `bonus_balance` converts to cash in one shot. If bonus expired, winnings redirect to cash rather than burn.
- Bonus rules loosened (pre-launch) — max-bet-while-bonus $5 → $100 (effectively removed), min-odds-to-count 2.0 → 1.0 (any odds count toward wagering). 3x multiplier and 14-day expiry unchanged.
- WageringProgress banner — tap-to-expand reveals the 4 bonus rules so users actually understand the requirement.
- Withdraw UI redesigned (April 2026) — destination field empty by default (no more pre-filled "random-looking" embedded wallet), small "use my embedded wallet →" link surfaces the Privy address non-pushily, status chips at top show "usually under 5 minutes" + "no KYC under $2,000", warning copy explicitly mentions "sending to another chain will result in lost funds".
- Recent Transactions on `/wallet` — `/api/transactions` endpoint (auth via `verifyRequest`) returns the user's ledger. Previously the wallet page was fetching from `/api/bet/history` which queried the wrong table and never returned matching shape. Re-fetches on window focus.
- Withdraw Solana-only guard (April 2026) — client-side rejects `0x…` (EVM) paste explicitly and anything that doesn't match base58 charset / 32–44 chars. Inline red error under the input. Server mirrors the 0x rejection with a clearer error before `isValidSolanaAddress()`. Closes the Metamask-paste footgun.
- Weekly withdrawal cap $2,000 (April 2026, MVP phase) — `LIMITS.MAX_WEEKLY_WITHDRAWAL` enforced rolling-7-day on both client and `/api/wallet/withdraw`. Surfaced in-UI as a cyan chip next to "no KYC under $2,000". Warning copy explains Solana-only + exchange fiat off-ramp path ("withdraw to an exchange's Solana USDC deposit address, convert there"). Copy positions the cap as "while we scale — lifts post-launch", not house-favouring.
- House edge raised 4.03% → ~9.09% (April 2026) — `OVERROUND` 1.042 → 1.10 in `lib/racing/odds-engine.ts`. Sits inside the 8–15% virtual-sports category band, gives the $10K bankroll variance headroom at 480 races/day. Bonus economics + root `CLAUDE.md` updated to match. Migration-free — pure code change, takes effect on next odds calc.

## FIXED: Race animation was stuck at 0 seconds in production

**Root cause:** The Vercel cron fires every 60 seconds, but the race cycle has 15-20 second phase transitions. The client calculated racing time from `bettingClosesAt + CLOSED_DURATION`, but by the time the server set status="racing" (on the next cron tick), the client's derived timestamp was already in the past — giving `timeRemaining = 0` instantly.

**Fix applied (April 2026):**
1. `race/state/route.ts` — now returns `raceStartsAt` (the actual server timestamp from `runRace()`, falls back to derived value)
2. `racing/constants.ts` — added `raceStartsAt?: string` to RaceState type
3. `racing/page.tsx` — `calcRacePhase()` now accepts and uses `raceStartsAt` for race/results timing instead of deriving from bettingClosesAt
4. `RaceCanvas.tsx` — animation progress now computed from `Date.now() - raceStartsAt` via a dedicated `requestAnimationFrame` loop (`raceElapsedRef`), independent of the polling-based `timeRemaining` which could be stale or zero

**If the animation breaks again:** Check that `/api/race/state` returns `raceStartsAt` when status is "racing". The `race_starts_at` column is set in `lib/racing/engine.ts:runRace()` line ~278. If it's null, the client falls back to derived timing which has the same cron-delay problem.

## FIXED: "0 seconds" freeze during gates-loading phase + horses teleport at race start

**Root cause:** Between phase transitions, the client was blocked on the server flipping `status` (`betting→closed`, `closed→racing`, `racing→settled`). On prod the Vercel cron only fires every 60s, so the wall clock could be ≥5 seconds past a boundary while the status was still the old value — the UI sat at "0 STARTING" waiting. Separately, horses rendered at `pos=3` (arbitrary fallback) during the closed phase, then jumped to `pos=0` (checkpoint[0]) when racing began — a visible teleport.

**Fix applied (April 2026):**
1. `racing/page.tsx` — `calcRacePhase()` now *optimistically advances status client-side* when the wall clock has passed a boundary, so the UI never stalls waiting for the next cron tick. Real server state still reconciles on the next poll.
2. `RaceCanvas.tsx` — added `closedRemainingRef`, a requestAnimationFrame-driven countdown derived from `bettingClosesAt + CLOSED_DURATION`. The gates overlay now reads this instead of the poll-based `timeRemaining`, so the number never stalls.
3. `RaceCanvas.tsx` — changed the pre-race fallback position from `3` to `0` so horses sit at the starting line (matching checkpoint[0]), eliminating the teleport when racing begins.
4. `RaceCanvas.tsx` — narrower position leaderboard panel (116px × UI_SCALE, 6px right gutter) so leading horses don't collide with the panel before camera scroll kicks in.
5. `lib/racing/engine.ts` — `settleRace()` now *self-heals* if finish positions are missing: it re-runs the simulation instead of throwing "No winner found" forever. Protects prod against a deploy or crash interrupting `runRace()` mid-flight.

## Multi-terminal coordination

Connor runs multiple Claude terminals in parallel. Every terminal should:
1. **Read the "Retention roadmap in progress" and "In-flight work log" sections below before starting** to avoid stepping on another terminal's work.
2. **Append a dated entry to the In-flight work log when you start and finish anything non-trivial** — even research. Include: date, terminal note (e.g. "Terminal A"), what you touched, what's blocked/next.
3. **Migrations are serialized.** Before writing a new migration, check the log for pending unapplied migrations. Don't write 022 if another terminal is mid-way through writing 022 — bump to 023.
4. **Env var additions get logged** — if you add a new `FOO_KEY`, note it under the Environment variables section AND in the work log so the other terminals know to reference it.

## Retention roadmap in progress (April 2026)

Research doc `swarm-research-for-launch/06-research-retention-mechanics.md` drives this. Connor approved the full plan: retention > acquisition. OVERROUND is 1.10 (~9% edge), which gives more headroom than the doc's 4% assumption — all bankroll math below uses 9%.

Phase order (each phase can be picked up by a fresh terminal; check the work log for status before starting):

- **Phase 1 — Rakeback** ✅ SHIPPED in `167d921`. User-claimed (not auto-swept), direct-to-balance (not bonus), no wagering requirement. Tiered 5/10/15/20/25% of edge on `users.total_wagered`. Migration 028 must be applied to prod — check work log entry.
- **Phase 2 — FingerprintJS wiring** ✅ SHIPPED (see work log 2026-04-21).
- **Phase 3 — Daily login bonus** ✅ SHIPPED in `030fb29`. Tiered $0.10–$1.00 into `bonus_balance` with 1× wagering. Ladder matches rakeback tiers.
- **Phase 4 — Resend + email templates** ✅ SHIPPED in `efa8595` (infra + 14 templates + transactional wiring + preferences UI + unsubscribe + Resend webhook). Non-time-based retention templates (rakeback nudge shipped with Phase 1; BigWin/BonusExpiring/StreakAtRisk/Reactivation/etc. still need a sending cron — depends on Phase 5 backing systems).
- **Phase 5 — Streaks + leaderboard wire-up** (20–28h) — **NEXT**. Login/bet streaks with freeze (Duolingo model). Replace the leaderboard stub at `app/(game)/leaderboard/page.tsx` (30-line placeholder) with a daily/weekly wager-race cron + snapshots table. Pool = % of prior period GGR. Unlocks the remaining email templates (WeeklyLeaderboardResult, StreakAtRisk).

**Deferred past launch:** Lucky Spin, VIP tier UI, achievements, triggered deposit match, quests, cashback (bankroll too thin at 10% of losses — revisit once volume proven).

## In-flight work log

Append-only. Newest entries at the top. Keep bullets terse.

### 2026-04-21 — Terminal B (geo-blocking) **PRE-PUSH**

Jurisdictional geo-block middleware. Sourced from `swarm-research-for-launch/25-geoblock-jurisdictions.md` §1A–1C. Ships the P0 middleware-only subset — IPQS VPN detection, Chainalysis sanctions screening, age-gate modal, dedicated `compliance_geo_blocks` table all remain deferred (per Connor's call: unlicensed soft-launch, add them when we have an Anjouan licence to protect).

**Not blocking AU for launch.** Connor is in AU pre-launch for testing. He'll add `AU` to `BLOCKED_COUNTRIES` in `lib/geo/blocklist.ts` in a one-line change when he relocates to Bali. Flagged inline in the file as a reminder.

**Files (local only until push):**
- `lib/geo/blocklist.ts` — single source of truth for the blocklist. Country set (US, GB, FR, NL, CW, ES, IT, DE, BE, PT, DK, SE, CH, SG, HK, TR, IL, PL, CZ + sanctions IR/KP/SY/CU/RU/BY/MM/SD/SS/ZW/VE/AF), US state set (WA/NV/NY/CT/NJ/PA/MI/WV/DE/TN/LA/ID/UT/HI — defence-in-depth; redundant while country-level US is blocked), UA occupied oblasts (Crimea/Luhansk/Donetsk), CA-ON. Pure `decideGeoBlock(country, region)` helper — easy to unit-test if we add tests later.
- `middleware.ts` — extended to run geo-block BEFORE admin auth. Uses `x-vercel-ip-country` / `x-vercel-ip-country-region` headers (Next.js 16 deprecated `req.geo`). Fails closed on missing/bad geo. Returns HTTP 451 "Unavailable for Legal Reasons" — rewrite to `/blocked` for HTML requests (preserves URL for auditors), JSON 451 for API routes. Dev mode (`NODE_ENV !== "production"`) skips geo entirely. Matcher expanded from `/admin/*` + `/api/admin/*` to everything-except-Next-statics, with an in-handler exempt list for `/_next/`, `/assets/`, `/api/cron/`, `/api/internal/`, `/api/webhooks/` (Resend), `/api/unsubscribe` (email one-click), `/api/geo-bypass`, `/blocked`, `/favicon*`.
- `app/blocked/page.tsx` — neutral compliance page. Shows detected country (named, not ISO code), Anjouan licence note, `compliance@throws.gg` appeals email, `support@throws.gg` for withdrawal help, RG helpline links (BeGambleAware / NCPG / Gambling Help Online). Explicitly does NOT suggest VPN. Timestamp embedded for dispute records. `robots: noindex/nofollow`.
- `app/api/geo-bypass/route.ts` — founder bypass. `GET /api/geo-bypass?key=<GEO_BYPASS_SECRET>` validates with constant-time compare, sets an HttpOnly 24h bypass cookie, redirects home. Lets Connor hit prod from AU (once AU is blocked) or any "Vercel got my geo wrong" edge case. Cookie is per-browser so Connor's phone and laptop both need a one-time visit.
- `app/api/internal/log-geo-block/route.ts` — receives fire-and-forget POSTs from the edge middleware (Edge Runtime can't call Supabase directly). Writes a row to `admin_actions` (`action_type='geo_block'`, `admin_identifier='geo-block'`) with `{reason, country, region, path, ua, referrer, ip}` in `after_value`. Authed via constant-time compare on `INTERNAL_GEO_LOG_SECRET` header. If secret isn't set, silently skips logging (fail-open for the log, fail-closed for the block itself).

**No `compliance_geo_blocks` dedicated table yet** — reusing `admin_actions` keeps this migration-free. Research doc §4C calls for a proper table with 5-year retention; `admin_actions` inherits that retention for free (we never delete from it). Upgrade path when needed: write a migration that `INSERT INTO compliance_geo_blocks SELECT … FROM admin_actions WHERE action_type='geo_block'` and flip the logger to write there instead.

**New env vars required in Vercel prod:**
- `GEO_BYPASS_SECRET` — random ≥20 chars. Without it, `/api/geo-bypass` returns 503 so the founder has no way to unblock themselves if accidentally geo-blocked. **Set before push** or you might lock yourself out if Vercel misidentifies your geo.
- `INTERNAL_GEO_LOG_SECRET` — random ≥20 chars. Without it, geo-block still works but the admin_actions log doesn't populate. Optional but recommended — the audit trail is cheap insurance.

**What's deliberately not shipped** (per Connor's decision, logged here so no one re-opens it without conversation):
- **Age-gate modal.** "Security theatre without real verification — adds friction without value pre-licence. Revisit when we apply for a licence."
- **Profanity filter on chat.** "We're all adults here. Users should feel free. Revisit if it becomes a moderation load."
- **IPQS VPN/proxy detection** ($99/mo + integration). Post-launch — Anjouan licence application trigger.
- **Chainalysis sanctions screening on deposits.** Post-launch — Anjouan licence application trigger.

**Operator pre-push checklist:**
1. Set `GEO_BYPASS_SECRET` in Vercel prod (e.g. `openssl rand -hex 24`). **Do this BEFORE pushing** so you can `GET /api/geo-bypass?key=<SECRET>` on your first prod visit if Vercel tags your AU IP wrong.
2. Set `INTERNAL_GEO_LOG_SECRET` in Vercel prod (same pattern, random ≥20 chars). Optional — geo-block runs without it, just no audit logging.
3. No migrations.
4. After push:
   - From AU (you): hit `/` — should load normally (AU not in blocklist).
   - Switch browser geo via VPN to US: hit `/` — should rewrite to `/blocked` with `?c=US&r=country`. URL bar still shows `/` (the rewrite preserves it).
   - `/api/race/state` from the VPN session: should return JSON 451.
   - Hit `/api/geo-bypass?key=<your SECRET>` from the VPN session — redirects home, cookie set, future requests bypass geo.
   - Check `admin_actions` table: new rows with `action_type='geo_block'` should appear for each blocked attempt.
5. `/blocked` should be reachable from anywhere (Resend bots, search crawlers, etc.) — confirm by hitting it directly.
6. Vercel cron paths (`/api/race/tick`, `/api/cron/*`) must still succeed — confirm via Vercel dashboard → Logs → filter by cron. If you see 451s on crons, the exempt list in middleware.ts is wrong.

**Known gotchas:**
- If Vercel's geo detection is down (header absent), `decideGeoBlock` treats that as `geo_unknown` and blocks. This is the "fail closed" posture the research doc specifies. If users start reporting legitimate blocks after Vercel has an incident, temporarily flip `GEO_EXEMPT_PREFIXES` to add `/` or put the bypass cookie across all users via a hotfix.
- The CSP in `next.config.ts` has `connect-src 'self' …` — the middleware's internal fetch to `/api/internal/log-geo-block` is same-origin so no CSP edit needed. Double-checked.
- Edge Runtime doesn't have `waitUntil` in the middleware signature as of Next 16.2 — the logging fetch is fire-and-forget with `keepalive: true` instead. If we need guaranteed delivery later, move logging to a downstream handler in the app router.

### 2026-04-21 — Terminal A (wallet UX fixes: daily-bonus deposit button + Privy onramp asset) — **PRE-PUSH**

Two small but user-visible bugs on `/wallet` reported by Connor during smoke testing:

**1. Daily bonus card "Deposit" button did nothing on `/wallet`.** The DailyBonusCard renders on both `/wallet` and `/profile`. Its "Deposit" unlock button was an `<a href="/wallet">` — on `/profile` that navigates correctly, but on `/wallet` it points to the current page so the user sees a flash/re-render with no apparent effect.

- `components/bonus/DailyBonusCard.tsx` — new optional `onDepositClick` prop. When provided, the Deposit button renders as a `<button>` and calls it. When omitted (e.g. `/profile`), it falls back to `<a href="/wallet#deposit-panel">` so same-page ambiguity is impossible.
- `app/(account)/wallet/page.tsx` — passes `onDepositClick` that does `setActiveTab("deposit")` then `requestAnimationFrame` + `scrollIntoView({ behavior: "smooth", block: "start" })` on the deposit panel anchor. Added `id="deposit-panel"` + `scroll-mt-20` to the deposit/withdraw toggle row so the scroll target clears the navbar.

**2. Privy "Buy USDC" onramp defaulted to buying SOL.** `components/wallet/DepositPanel.tsx` was calling `fundWallet({ address })` on the Privy Solana hook. Privy's `SolanaFundingConfig` supports `options.asset: 'native-currency' | 'USDC'`; omitting it defaults to native (= SOL). The deposit panel's CTA literally says "Buy USDC" so this was a product-promise mismatch — and credit-wise it'd force the user through a Jupiter swap before they see funds because our deposit scanner expects USDC.

- `components/wallet/DepositPanel.tsx` — `fundWallet({ address: walletAddress, options: { asset: "USDC" } })`. No Privy dashboard change needed; `asset` is a per-call hint.

**Regional caveat to watch:** Privy's onramp providers (Moonpay/Transak) can silently fall back to SOL-only in some regions (UK sometimes, parts of EU) when USDC isn't supported by the provider for that buyer. If we see reports of purchases completing as SOL despite the hint, that's the onramp-provider side — not the hint. Workaround path is already live: buy SOL → deposit scanner credits SOL delta via the baseline flow in `app/api/wallet/deposit/route.ts`.

**Smoke test:** on `/wallet` tap the Daily Bonus "Deposit" button → page should smooth-scroll to the deposit/withdraw toggle with Deposit tab active. Tap "Buy USDC" → Privy onramp modal should preselect USDC, not SOL.

### 2026-04-21 — Terminal A (Phase 4 follow-up: Google OAuth email capture) — **SHIPPED in `167d921`**

**Bug** found during post-deploy smoke test: new Google signup via Privy never received the welcome email, and `users.email` was `NULL` for every Google OAuth user. Root cause in `components/layout/Providers.tsx:47` — it read `user.email?.address`, which Privy only populates for the email-login method. For Google OAuth, Privy stores the address at `user.google.email`. So `/api/auth/sync` received `email: null` and silently skipped both the `users.email` write AND the welcome send (guarded by `if (email)`).

**Fix shipped** in `167d921` (same commit as Phase 1 rakeback — piggybacked since Connor was pushing):
- `components/layout/Providers.tsx` — email now resolves via fallthrough `user.email?.address → user.google?.email → user.linkedAccounts[]` (matches `type === "email"` → `.address`, `type === "google_oauth"` → `.email`). Covers current login methods and future-proofs Apple/Twitter/etc.
- `app/api/auth/sync/route.ts` — lazy email backfill on the `existing` (returning-user) branch. If `users.email IS NULL` and the sync request carries an email, write it (plus `normalized_email` via the `normalize_email` RPC) write-once, then fire the welcome with idempotency key `welcome:<userId>`. The update is gated on `.is("email", null)` so it only ever runs once per user. Any Google user who signed up pre-fix gets their email captured + a welcome on their next page load.

**Why write-once matters:** `.is("email", null)` means a user can't change their Privy email later and have us overwrite what we stored (stops an attacker with a hijacked Privy account from swapping the email on our side). Same pattern as the existing `wallet_address` backfill above it.

**No new env vars. No new migrations. No Resend config changes.**

**Smoke test:** log out, log back in with the same Google account that didn't receive a welcome. The lazy backfill should populate `users.email`, fire the welcome, and `email_log` should get a new row (category `lifecycle`, `idempotency_key = welcome:<userId>`).

### 2026-04-21 — Terminal B (Phase 1 — Rakeback) **SHIPPED TO PROD** (`167d921` on main)

User-claimed rakeback. Accrues on every settled bet (stake-based, not outcome-based). Accumulates in `users.rakeback_claimable` until user clicks Claim — no auto-sweep, no wagering requirement, credits direct to `users.balance`. Safe because rakeback is generated only by real wagering which is already taxed by edge.

**Migration 028_rakeback.sql** ⏳ check with Connor — the code is live on Vercel but migration 028 needs manual `psql` application. Until applied, `accrue_rakeback` / `claim_rakeback` RPCs are missing and settles will swallow the error silently (bets still settle, zero rakeback accrues). Apply with: `psql $DATABASE_URL < supabase/migrations/028_rakeback.sql` (safe to re-run).
- `rakeback_accruals` ledger table (one row per settled bet, UNIQUE on `race_bet_id` — idempotent against settle retries).
- `users.rakeback_claimable` + `rakeback_lifetime` + `last_rakeback_claim_at` + `last_rakeback_nudge_at` columns.
- `rakeback_tier(total_wagered)` — IMMUTABLE, returns (tier, tier_pct). Ladder: Bronze 5% / Silver 10% / Gold 15% / Platinum 20% / Diamond 25% at $0 / $500 / $5K / $25K / $100K lifetime.
- `accrue_rakeback(user_id, race_bet_id, stake)` — idempotent via unique violation. Writes ledger + bumps `rakeback_claimable`. Uses `EDGE_RATE = 0.0909` (matches OVERROUND = 1.10 — if overround changes, update both here and `lib/rakeback/tiers.ts`).
- `claim_rakeback(user_id)` — atomic with `SELECT … FOR UPDATE` on user row. Drains claimable → balance, stamps `claimed_at` on the ledger, writes a `bonus` transaction with `metadata.source = 'rakeback_claim'`, bumps `rakeback_lifetime`. No minimum amount.
- `settle_race` rewritten to call `accrue_rakeback` per bet (inside a BEGIN/EXCEPTION so a rakeback failure never blocks settlement).

**Files (shipped in `167d921`):**
- `lib/rakeback/tiers.ts` — TS mirror of the SQL tier ladder + edge rate + helpers (`getRakebackTier`, `getNextRakebackTier`).
- `app/api/rakeback/status/route.ts` — GET, `verifyRequest()`, returns `{ tier, tierLabel, tierPct, effectivePct, claimable, lifetime, totalWagered, edgeRate, lastClaimAt, nextTier: {...} | null }`.
- `app/api/rakeback/claim/route.ts` — POST, `verifyRequest()`, wraps `claim_rakeback` RPC. Fires PostHog `rakeback_claimed`. Returns `{ claimed, amount, newBalance, tier, lifetime }`.
- `components/bonus/RakebackCard.tsx` — cyan-gradient card matching DailyBonusCard's visual language. Tier badge, claimable amount, Claim button (disabled when 0), progress bar to next tier, lifetime total. No wagering copy — it's direct-to-balance.
- `app/(account)/wallet/page.tsx` — mounted below `<DailyBonusCard />`.
- `app/(account)/profile/page.tsx` — mounted between `<VipProgress />` and `<ReferralCard />` so the VIP progression visually leads into the claim action.

**Weekly nudge cron** (live):
- `app/api/cron/rakeback-nudge/route.ts` — `verifyCron()`-protected. Finds users with `rakeback_claimable > 0` who haven't claimed or been nudged in 7+ days, AND have an email, AND aren't globally unsubscribed. Fires `RakebackReady` email via `retention` category (respects per-user preferences). Batched to 500/run. Idempotency key is `rakeback-nudge:{userId}:{iso-week}` so reruns in the same week hit the `email_log` dedup.
- `vercel.json` — schedule `0 16 * * 0` (Sunday 16:00 UTC). Decent global time-of-day coverage for a weekly send.

**Tone:** "confident + light personality" per the updated feedback memory. RakebackReady template reads "a cut of your wagering just hit claimable. no wagering requirement, no expiry." Not "LFG".

**Known pre-existing design mismatch** (flagging, not fixing in this pass):
- `/profile` has its own `VIP_TIERS` array (`Bronze $0 / Silver $1K / Gold $10K / Platinum $50K / Diamond $250K`) which **does not match** the rakeback tier thresholds (`$0 / $500 / $5K / $25K / $100K`). The feedback memory says VIP should wrap rakeback as the headline benefit, so these two need to be unified. Leaving `/profile` VIP_TIERS alone for now so I don't step on whoever owns that component. Future cleanup: source both from `lib/rakeback/tiers.ts` and delete the `/profile` private ladder.

**Operator post-push checklist:**
1. **Apply migration 028** to prod Supabase if not already done: `psql $DATABASE_URL < supabase/migrations/028_rakeback.sql`. Safe to re-run (CREATE OR REPLACE / IF NOT EXISTS / ADD COLUMN IF NOT EXISTS). **Without this, accrual silently no-ops.**
2. No env vars to add.
3. Verify:
   - `/wallet` page shows both DailyBonusCard and RakebackCard stacked.
   - `/profile` shows RakebackCard between VIP and Referral.
   - Place a bet, let it settle, refresh `/wallet` → RakebackCard `claimable` nonzero. Tier should be Bronze for a fresh account.
   - Click Claim → balance jumps by the claimable amount, card shows `+$X.XX added to your balance.` flash, lifetime updates. PostHog fires `rakeback_claimed`.
   - `transactions` table has the `bonus` row with `metadata.source = 'rakeback_claim'`.
   - `rakeback_accruals` table has one row per bet settled, `claimed_at` stamped after claim.
4. Nudge cron: can test manually with `curl -H "Authorization: Bearer $CRON_SECRET" https://throws.gg/api/cron/rakeback-nudge`. Returns `{ nudged, skipped, candidates }`. Should only email users who've sat on rakeback >7 days.

**Retention queue remaining:** Phase 5 (streaks + daily/weekly leaderboard). Phase 3 (daily login bonus) is already shipped to prod by Terminal A via `030fb29`. Once rakeback lands, the next clean unit of work is leaderboard wire-up.

### 2026-04-21 — Terminal A (Phase 3 — Daily login bonus) **SHIPPED TO PROD** (`030fb29` on main)

Daily login bonus live end-to-end. Rides the existing `bonus_balance` / `wagering_remaining` rails from migrations 013 + 024 — no new balance concept. 1× wagering. Tier ladder mirrors rakeback (Phase 1) so users see one progression, not two.

**Migration 027_daily_login_bonus.sql** ✅ applied to prod by Connor.
- `daily_claims` table (user_id, claimed_at, claim_date DATE, amount, wagering_added, tier, fingerprint_visitor_id, ip_address). Unique `(user_id, claim_date)` enforces one-per-UTC-day.
- `users.last_daily_claim_at` added.
- `daily_bonus_tier(total_wagered)` — returns (tier, amount). Bronze $0.10 / Silver $0.20 / Gold $0.35 / Platinum $0.50 / Diamond $1.00 at $0 / $500 / $5K / $25K / $100K.
- `claim_daily_bonus(user_id, fingerprint, ip)` — atomic. Checks: banned, UTC-day dedup, ≥$5 cumulative confirmed deposits, 24h rolling fingerprint + IP dedup. Credits `bonus_balance` + `wagering_remaining` (1×). Extends `bonus_expires_at` to max(existing, NOW+14d). Logs `bonus` transaction with `metadata.source = 'daily_login_bonus'`.
- `get_daily_bonus_status(user_id)` — read-only eligibility for the UI.

**Files (all shipped in `030fb29`):**
- `lib/bonus/daily.ts` — TS mirror of the SQL tier ladder, `getDailyBonusTier()` / `getNextDailyBonusTier()` helpers.
- `app/api/bonus/daily/status/route.ts` — GET, `verifyRequest()`, returns `{ eligible, alreadyClaimedToday, amount, tier, tierLabel, nextClaimAt, depositRequired, currentDeposits, totalWagered }`.
- `app/api/bonus/daily/claim/route.ts` — POST, `verifyRequest()`, server-verifies fingerprint via `verifyFingerprint()` (matches auth/sync pattern — untrusted/spoofed visitor IDs get nulled before hitting the RPC). Returns `{ granted, reason?, amount, tier, wageringAdded, nextClaimAt, user: { balance, bonusBalance, wageringRemaining, bonusExpiresAt } }`. Fires PostHog `daily_bonus_claimed` with tier, amount, fingerprint verification status.
- `components/bonus/DailyBonusCard.tsx` — tier badge, amount, claim button, countdown when claimed, next-tier progress hint. Handles needs-deposit + already-claimed + banned + duplicate-fingerprint/ip states with specific copy.
- `app/(game)/racing/page.tsx` — mounted above `<WageringProgress />`.
- `app/(account)/wallet/page.tsx` — mounted below balance card.

**Design note — one unified bonus bucket:** daily credits flow into the same `bonus_balance` + `wagering_remaining` as the signup bonus. If a user has an active $16 signup bonus with $30 wagering remaining and claims a $0.20 daily, they now have $16.20 bonus + $30.20 wagering — neutral (1× multiplier). Prevents two parallel bonus UIs / two sets of balance math. `settle_race` + `place_race_bet_atomic` already route payouts proportionally, no changes needed.

**No env vars to add.** No new deps. `FINGERPRINT_SECRET_KEY` already set in Vercel.

**Operator QA after push:**
1. Fresh throwaway account, no deposit → card shows "Deposit $5 to unlock" + CTA.
2. Deposit $5+ → card shows Claim button at Bronze ($0.10).
3. Claim → `bonus_balance` jumps $0.10, `wagering_remaining` jumps $0.10, card flips to "claimed today, next in Xh Ym". PostHog fires `daily_bonus_claimed`.
4. Refresh page → still claimed.
5. Second browser, same IP, fresh account → should be blocked by `duplicate_ip`.
6. Check Supabase `daily_claims` table has the row. Check `transactions` has the `bonus` row with `metadata.source = 'daily_login_bonus'`.
7. Spot-check `/wallet` Recent Transactions list shows the claim.

**Tone update — `feedback_tone_of_voice.md` reversed:** Connor dialled back the full degen/meme tone to "confident + light personality, not meme-heavy". DailyBonusCard copy reflects this ("Claim" not "LFG your $0.20 is ready"). CLAUDE.md's "Degen tone" guideline is now stale — treat the memory as source of truth.

**Heads-up for next session:** `app/(account)/wallet/page.tsx` now imports `RakebackCard` (Phase 1 shipped separately in `167d921`). The daily-bonus card sits just above it.

**Next in retention queue:** Phase 5 (streaks + daily/weekly leaderboard wire-up). Phase 1 rakeback already shipped in `167d921`. The remaining leaderboard stub is at `app/(game)/leaderboard/page.tsx`.

### 2026-04-21 — Terminal B + A bundle **SHIPPED TO PROD** (`efa8595` on main)

Pushed a single bundle containing Terminal B's deferred security hardening AND Terminal A's full Phase 4 Resend email bundle (was sitting pre-push, tangled in the same files — shipping together resolved the tangle). Also swept up two other pre-push changes that were already in the working tree: odds overround 1.042→1.10 and WithdrawPanel Solana-only client guard.

**Security hardening (audit §7 deferred items):**
- **I3** — `next.config.ts`: `X-Frame-Options: DENY` (kills `/wallet` clickjacking), HSTS 2y+preload, Referrer-Policy, Permissions-Policy, X-Content-Type-Options, CSP **Report-Only** (allowlist covers Privy / PostHog / Supabase / Solana RPCs / Fingerprint / Resend). Watch the violation reports for a few days before promoting to enforcing.
- **I4** — `lib/analytics/posthog-server.ts` central `scrubProperties`: `wallet_address` → `wallet_hash` (SHA-256, 16 hex), `tx_hash` dropped, raw balance fields (`new_balance` / `current_balance` / `total_wagered` etc.) → `*_tier` buckets. Call sites didn't need edits. Client `identify()` in `Providers.tsx` also tiered.
- **I6** — `Providers.tsx` Privy `loginMethods: ["email", "google"]` (dropped `"wallet"`, removes Metamask/EVM signin footgun). Ethereum embedded wallet config removed.
- **W4** — `lib/wallet/send-usdc.ts` gained `getHotWalletSolBalance()` + `HOT_WALLET_SOL_FLOOR = 0.01`. Auto-send path in `/api/wallet/withdraw` pre-flights SOL before `update_balance`; if low, returns 503 + writes `admin_actions` row (`action_type = 'hot_wallet_low_sol'`) instead of opaque post-debit refund. Large-withdrawal path skips this (admin initiates send).

**Phase 4 Resend email bundle (Terminal A):**
- `lib/email/`: Resend client, typed `send.ts`, 14 templates (Welcome, DepositReceived, WithdrawalSent, FirstDepositNudge, FirstBetPlaced, BigWin, BonusExpiring, StreakAtRisk, WeeklyCashbackReady, RakebackReady, Reactivation D7/D14/D30, WeeklyLeaderboardResult, RGMonthlyCheckin), shared `_layout`, HMAC unsubscribe tokens (`ADMIN_SESSION_SALT`-keyed).
- Transactional wiring live: `auth/sync` → Welcome, `wallet/deposit` → DepositReceived, `wallet/withdraw` → WithdrawalSent (confirmed + recovered_from_unknown paths). All idempotent-keyed.
- `/api/user/email-preferences` GET/POST, `/settings` per-category UI, `/unsubscribe` one-tap + `/api/unsubscribe` POST (Gmail/Yahoo one-click compliance).
- `/api/webhooks/resend` — Svix-signed, fail-closed in prod. Writes open/click/bounce/complaint timestamps to `email_log`. Spam complaints auto-trigger global unsubscribe.
- `auth/sync` now also backfills `signup_fingerprint` / `signup_ip` / `normalized_email` on every signup — closes the migration 025 self-referral block gap for non-bonused signups.

**Other swept-in changes:**
- `lib/racing/odds-engine.ts` — `OVERROUND 1.042 → 1.10` (~9% edge, virtual-sports category band, $10K bankroll headroom at 480 races/day).
- `components/wallet/WithdrawPanel.tsx` — client-side Solana-only address guard (inline `0x...` rejection, base58 check).
- `.gitignore` — added `video/` (710MB Remotion project was untracked).

**Env vars now required in Vercel prod (before full functionality):**
- `RESEND_API_KEY` — from resend.com/api-keys. Without it, emails silently no-op (safe).
- `RESEND_WEBHOOK_SECRET` — from Resend dashboard once endpoint added. Without it, webhook 401s (safe).
- `NEXT_PUBLIC_APP_URL` — optional, defaults `https://throws.gg`. Only matters for preview envs.
- `EMAIL_FROM` / `EMAIL_REPLY_TO` — optional, defaults documented below.
- `NEXT_PUBLIC_FINGERPRINT_PUBLIC_KEY` + `FINGERPRINT_SECRET_KEY` — already set per earlier entries.

**Operator post-push checklist:**
1. Verify `throws.gg` sending domain in Resend (SPF/DKIM/DMARC DNS).
2. Add `https://throws.gg/api/webhooks/resend` endpoint in Resend subscribed to `email.opened/clicked/bounced/complained`. Copy signing secret → `RESEND_WEBHOOK_SECRET` in Vercel.
3. Set `RESEND_API_KEY` in Vercel.
4. Smoke test: signup → welcome email; deposit $1 → deposit email; withdraw $5 → withdrawal email; footer unsub link → `/settings` amber banner → resubscribe clears.
5. PostHog sanity: new withdrawal event should show `wallet_hash` (not `wallet_address`), `new_balance_tier` (not `new_balance`), no `tx_hash` property. Privy login modal should list only Email + Google.
6. Browser devtools on `/`: `X-Frame-Options: DENY` + `Content-Security-Policy-Report-Only` headers present.

**Still deferred past launch** (not pre-launch-critical, from audit §7):
- I5 structured logging (`console.error(err)` paths could leak hot-wallet key bytes in Vercel logs if a future debug session logs a raw Error).
- A7 admin login distributed rate-limit (in-memory per-lambda defeatable, bar is high).
- A8 admin CSRF token (sameSite=lax mostly sufficient for our setup).
- A9 default-auth middleware on `/api/**` (structural fix to prevent future forgotten-`verifyRequest` regressions).

**Not-yet-wired email templates** (templates exist, no backing system yet): BigWin, BonusExpiring, StreakAtRisk, WeeklyCashbackReady, RakebackReady, Reactivation D7/D14/D30, WeeklyLeaderboardResult, RGMonthlyCheckin — all depend on Phase 1/3/5 (rakeback, streaks, leaderboard, cashback) which are un-started. Cron-driven sweep endpoint deferred with them.

**Next available work** (any terminal can pick up — no tangles):
- Retention Phase 1 (rakeback, 10–14h).
- Retention Phase 3 (daily login bonus, 6–10h — depends on Phase 2, already shipped).
- Retention Phase 5 (streaks + leaderboard wire-up, 20–28h).
- Admin UI tab for `admin_actions WHERE action_type='hot_wallet_low_sol'` (hot-wallet top-up alert surfacer).

### 2026-04-21 — Terminal A (Phase 4 Resend emails — full bundle — superseded by `efa8595`)

Built on top of the earlier Phase 4 scaffolding. Migration 026 was applied by Connor. Everything below is local only — nothing pushed yet.

**Templates added** (`lib/email/templates/`): `FirstDepositNudge`, `FirstBetPlaced`, `BigWin`, `BonusExpiring`, `StreakAtRisk`, `WeeklyCashbackReady`, `RakebackReady`, `ReactivationD7`, `ReactivationD14`, `ReactivationD30`, `WeeklyLeaderboardResult`, `RGMonthlyCheckin`. All use the shared `_layout` shell.

**Transactional wiring (live now):**
- `/api/wallet/deposit` — fires `DepositReceived` after a successful credit, idempotency keyed on the latest USDC signature (or `sol-<slot>` for SOL-only).
- `/api/wallet/withdraw` — fires `WithdrawalSent` on both the happy `confirmed` path and the `recovered_from_unknown` path, keyed on the tx signature.

**Not wired — awaiting Phase 1/3/5:** Big win, bonus expiring, streak at risk, cashback, rakeback, reactivation D7/D14/D30, weekly leaderboard, RG monthly check-in. All dependent on systems that don't exist yet (streaks, rakeback, cashback, weekly leaderboard cron). Templates are complete so those phases can drop them in without re-opening the email layer. Cron-driven sweep endpoint deferred with them.

**Preferences UI + API (live):**
- `GET/POST /api/user/email-preferences` — reads/writes `users.email_preferences` (JSONB) + `email_unsubscribed_at`. Transactional is never user-disableable.
- `/settings` page — per-category checkboxes (always-on chip for transactional), global unsubscribe button, amber "you're unsubscribed" banner with resubscribe. Saves inline on toggle.

**Unsubscribe flow (live):**
- `lib/email/unsubscribe-token.ts` — HMAC-SHA256 signed tokens using `ADMIN_SESSION_SALT` (already required ≥32 chars in prod). Format: `userId.scope.sig`. No expiry.
- `/unsubscribe?token=…` — server component, unsubscribes on GET (one-tap from email), fallback to settings link on invalid token.
- `POST /api/unsubscribe` — handles Gmail/Yahoo one-click POSTs (reads token from query OR body). Signed-token auth — no login required.
- `lib/email/send.ts` — every send now attaches `List-Unsubscribe: <url>, <mailto:unsubscribe@throws.gg>` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Required for Gmail/Yahoo bulk-sender compliance.

**Resend webhook (live):**
- `POST /api/webhooks/resend` — Svix-signed (HMAC-SHA256, 5-min replay window). Handles `email.opened/clicked/bounced/complained` → writes the matching timestamp column on `email_log` (matched via `resend_message_id`). Spam complaints auto-trigger global unsubscribe on the associated user. `RESEND_WEBHOOK_SECRET` required in prod (fail closed), optional in dev.

**Env vars that need setting in Vercel prod before this ships:**
- `RESEND_API_KEY` — from resend.com/api-keys (already called out in Terminal A's earlier entry, still required).
- `RESEND_WEBHOOK_SECRET` — from the Resend dashboard once the webhook endpoint is configured (Endpoints → add `https://throws.gg/api/webhooks/resend` → copy the signing secret, `whsec_…` prefix fine, we strip it).
- `NEXT_PUBLIC_APP_URL` — optional, defaults to `https://throws.gg`. Only matters if you want unsub links to land somewhere else in a preview env.
- `EMAIL_FROM` / `EMAIL_REPLY_TO` — already documented, still optional.

**Operator pre-push checklist:**
1. Migration 026 — ✅ applied by Connor.
2. Resend: verify `throws.gg` sending domain (SPF/DKIM/DMARC DNS), add `https://throws.gg/api/webhooks/resend` as an endpoint subscribed to `email.opened/clicked/bounced/complained`, copy signing secret → `RESEND_WEBHOOK_SECRET` in Vercel.
3. Set `RESEND_API_KEY` in Vercel prod.
4. Smoke test: signup → confirm welcome lands. Deposit $1 → confirm deposit email. Withdraw $5 → confirm withdrawal email. Hit the footer unsubscribe link → confirm `/settings` shows the amber banner. Toggle "resubscribe" → confirm banner clears.
5. Optional: set up a catch-all inbox for `unsubscribe@throws.gg` (the mailto fallback in `List-Unsubscribe`). Gmail doesn't use it when HTTPS unsub is present, but some clients still do.

**Known follow-ups:**
- Cron for time-based sends (bonus-expiring, reactivation, RG monthly, weekly leaderboard/cashback/rakeback). Deferred until Phase 1/3/5 land their backing systems.
- Consider batching the `email_log` webhook updates if open/click volume gets noisy — single UPDATE per event is fine at launch volume.
- The `/api/unsubscribe` POST accepts the token from the query string, but Gmail's one-click flow actually POSTs to the URL in the `List-Unsubscribe` header verbatim. Our current header includes `?token=…` in the URL, so Gmail will POST to that URL with an empty body — handled by the query-string-first branch. Good.

### 2026-04-21 — Terminal B (pre-launch security audit) — **SHIPPED TO PROD**

Driving the audit at repo root `SECURITY_AUDIT_2026-04-20.md` + overlapping spec in `swarm-research-for-launch/33-auth-remediation-spec.md` / `00-EXECUTIVE-SUMMARY.md`. Four-agent sweep found ~20 exploitable issues — auth, money flows, race fairness, client/infra.

**Status:** All 14 launch-blockers committed + pushed to `main` + live on Vercel. Connor smoke-tested basic flows (login, bet, cancel, chat, deposit page) — all working. Admin panel testing in progress (2026-04-21 evening).

**Commits on main (origin/main up to `cffde03`):**

| SHA | Phase | What |
|---|---|---|
| `7da9c78` | Phase 1 | Auth holes + env loader + legacy-route deletions |
| `7f090da` | Phase 2a | Race fairness (R1 probability leak + TOCTOU liability cap) |
| `60683dc` | Phase 2b | Money integrity (SPL guard + W1 deposit race + W2 withdraw + W5/W6 bonus + W7 self-referral) |
| `b820050` | Docs | CLAUDE.md work log + house-edge policy |
| `cffde03` | Hotfix | `LIMITS.MAX_WEEKLY_WITHDRAWAL` constant (typecheck unblock) |

**Holes closed (summary):**
- **Phase 1:** zod env loader + `instrumentation.ts` (prod boot throws on missing secrets, silent dev fallbacks no longer activate in prod); `isDevMode()` prod-guarded in `lib/auth/privy.ts` + `verify-request.ts`; admin password/salt dev fallbacks dropped; `lib/cron/verify.ts` constant-time CRON_SECRET check required in prod (applied to race/tick, game/tick, affiliate-payouts, affiliate-tiers); chat/send + wallet/deposit now call `verifyRequest()` — userId + walletAddress derived server-side (closes chat impersonation + confused-deputy deposit-crediting); `auth/sync` writes `solanaAddress` → `users.wallet_address` write-once; legacy `api/bet/{place,cancel,history}` and `api/dev/user` deleted.
- **Phase 2a:** `/api/race/state` strips `trueProbability` + `powerScore` until `status === "settled"` (closes the +EV-bot leak); migration 022 rewrites `place_race_bet_atomic` with `p_max_liability` param + `SELECT … FOR UPDATE` on `race_entries` (closes the TOCTOU race where 10 concurrent $1 @ 100× could stack $1.6K vs $720 cap).
- **Phase 2b:** `getForeignTokenBalances()` + amber UI banner for non-USDC SPL (closes the silent USDT/PYUSD drop); migration 023's partial UNIQUE index on `transactions.tx_hash` + `getUsdcTransfersIn()` (per-signature dedup closes the double-credit race); `sendUsdc` now returns `confirmed | not_submitted | unknown` + `checkSignatureStatus()` polling (no more auto-refund after tx lands on chain); migration 024's `cancel_race_bet_atomic` + `place_race_bet_atomic` rewrite (refund routes proportionally to cash/bonus, wagering only decrements on `from_bonus > 0` — closes the bonus-laundering pathways); migration 025's `accrue_simple_referral_reward` rewrite (skips accrual when referrer and referred share fingerprint / IP / email).

**Known inert piece:** `app/api/auth/sync/route.ts` has an uncommitted hunk that writes `signup_fingerprint` / `signup_ip` / `normalized_email` on every signup (needed by 025's self-referral check for the cap-hit / bonus-disabled signup paths). It's tangled with Terminal A's email-infra work on the same file. Until Terminal A ships their email bundle, 025's self-referral block is **active but only trips for users whose dedup fields got populated via `grant_signup_bonus`** — i.e. first-100 bonused signups. New non-bonus signups won't trip it (referrer DOES have the fields, but referred may not). Low launch-risk because you're still inside the 100-bonus cap, but to close fully, Terminal A's email bundle needs to ship + then my hunk lands on top.

**Migrations applied to prod (idempotent, CREATE OR REPLACE style):**
- 022 liability cap + TOCTOU fix
- 023 tx-signature dedup (UNIQUE index + `deposit_addresses.last_processed_slot` + `sol_baseline_lamports`)
- 024 bonus cancel + wagering counter fix (`cancel_race_bet_atomic` new, `place_race_bet_atomic` rewritten)
- 025 self-referral block (`accrue_simple_referral_reward` rewrite + `admin_actions` audit writes on block)

**Vercel env vars confirmed set in prod:** `ADMIN_PASSWORD` ≥12 chars, `ADMIN_SESSION_SALT` ≥32 chars, `CRON_SECRET` ≥20 chars, `HOT_WALLET_PRIVATE_KEY`, `PRIVY_APP_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (rotated to new Supabase "secret key" system).

**Follow-ups for a future session:**
1. Cherry-pick the `auth/sync` dedup-fields hunk once Terminal A's email bundle is in `main`.
2. Consider adding an admin UI tab for withdrawals with `metadata.pending_review: true` — these are W2's "confirmation unknown, balance debited" cases needing manual reconciliation. Rare but inevitable; not blocking launch.
3. Consider filter/view in admin for `admin_actions.action_type = 'referral_self_block'` rows (W7 audit trail) to unblock false positives.
4. **Deferred security items (not launch-blockers, from `SECURITY_AUDIT_2026-04-20.md` §7):** hot wallet SOL-balance alert (W4), CSP / X-Frame-Options headers (I3), PostHog PII scrubbing of wallet addresses + raw balances (I4), structured logging to prevent secret leaks in Vercel logs (I5), Privy `loginMethods` tightening to Solana-only (I6), default-auth middleware on `/api/**` (A9), admin 2FA (A7), admin CSRF (A8).

### 2026-04-21 — Terminal A (Phase 4 Resend + emails — scaffolding + welcome)
- **Migration reservation:** Terminal B has reserved 022, 024, 025. Terminal A owns **026+**.
- **Installed:** `resend`, `@react-email/components`, `@react-email/render`.
- **New files:**
  - `lib/email/client.ts` — Resend singleton, no-ops when `RESEND_API_KEY` unset.
  - `lib/email/categories.ts` — 8 categories (`transactional` always sends; others respect user prefs). Defaults opt-in except `promotional`.
  - `lib/email/send.ts` — typed send helper. Handles preference gating, idempotency via `email_log`, render, logging.
  - `lib/email/templates/_layout.tsx` — shared dark-theme shell (throws.gg purple logo, footer with preferences/RG/terms links).
  - `lib/email/templates/Welcome.tsx` — welcome + signup bonus explainer.
  - `lib/email/templates/DepositReceived.tsx` — deposit confirmation (transactional).
  - `lib/email/templates/WithdrawalSent.tsx` — withdrawal confirmation w/ Solscan link (transactional).
- **Migration 026_email_infra.sql ⏳ NOT YET APPLIED** — adds `users.email_preferences` (jsonb), `users.email_unsubscribed_at`, `users.email` column + unique index; creates `email_log` table for analytics + idempotency.
- **Wired:** `/api/auth/sync` now writes `email` into `users.email` on signup AND fires the welcome email (best-effort, won't block response). Uses idempotency key `welcome:<userId>`.
- **Env vars needed in Vercel prod (and locally if testing):** `RESEND_API_KEY`, optional `EMAIL_FROM` (defaults `throws.gg <no-reply@throws.gg>`), optional `EMAIL_REPLY_TO` (defaults `support@throws.gg`).
- **Still to build (12 templates):** first deposit nudge, first bet placed, big win (>$50), bonus expiring D12, streak at risk, weekly cashback ready, rakeback ready, reactivation D7/D14/D30, weekly leaderboard result, RG monthly check-in.
- **Still to build (infrastructure):** `/settings` email preferences UI, `/api/user/email-preferences` endpoint, Resend webhook handler for opened/clicked/bounced/complaint → writes back to `email_log`, unsubscribe link handling.
- **Operator pre-push checklist for this phase:**
  1. Apply migration 026 to prod Supabase (CREATE OR REPLACE / IF NOT EXISTS — safe to re-run).
  2. Resend account: add `throws.gg` as sending domain, drop SPF/DKIM/DMARC in DNS, wait for verification.
  3. Set `RESEND_API_KEY` in Vercel prod env.
  4. Test welcome email flow with a throwaway signup.

### 2026-04-21 — Terminal A (retention kickoff)
- **Reviewed** `swarm-research-for-launch/06-research-retention-mechanics.md` against current code. Confirmed: leaderboard page is a 30-line stub, no streaks/rakeback/daily-bonus/quests/push/email exist, `@fingerprintjs/fingerprintjs-pro` SDK is installed but wasn't wired up.
- **Phase 2 SHIPPED — FingerprintJS server-side verification:**
  - Added `lib/fingerprint/server.ts` — calls Fingerprint Server API, checks visitor ID freshness (<5min), IP match, bot/incognito flags. No-ops gracefully when `FINGERPRINT_SECRET_KEY` isn't set.
  - Wired into `app/api/auth/sync/route.ts` — untrusted/spoofed fingerprints get nulled before being passed to `grant_signup_bonus`, so the $20 bonus dedup can't be farmed with fake visitor IDs. Added `fingerprint_verified/reason/bot_detected/incognito` to the `signup_completed` PostHog event.
  - `lib/fingerprint/client.ts` and Providers.tsx wiring already existed — no changes there.
  - **Env:** needs `NEXT_PUBLIC_FINGERPRINT_PUBLIC_KEY` + `FINGERPRINT_SECRET_KEY` in Vercel. Connor confirmed set in Vercel prod but NOT in `.env.local` (local dev will no-op — acceptable).
- **Not yet started:** Phases 1, 3, 4, 5. Next likely = Phase 1 (rakeback) or Phase 4 (Resend). Pending Connor's choice.

### 2026-04 — (earlier work) Session handoff — active context (refresh this when picking up)

**Last worked:** 2026-04-21. Focus was withdraw hardening (Solana-only address guard + $2K weekly MVP cap) and economics calibration (overround 1.042 → 1.10 ≈ 9% edge). No migrations this session. A 50k-race Monte Carlo sim of the new overround was kicked off via `npx tsx scripts/simulate-odds.ts 50000` to validate book % / favourite rate / bucket calibration — results should be reviewed on next pickup if not already in hand (check `/private/tmp/claude-501/-Users-connorrawiri-Documents-RPS/*/tasks/bbmhfwypt.output`).

**Test account:** `degen_9vmqb9` (signed up via a referral code for testing). Had its balance manually clawed back after a bonus-abuse test case with:
```sql
update users set balance = 0, bonus_balance = 16, wagering_remaining = 50
where username = 'degen_9vmqb9';
```
Don't treat this user's numbers as representative of real behaviour.

**Hot wallet setup:** Phantom (burner account in a dedicated Chrome profile). Private key in Vercel env as `HOT_WALLET_PRIVATE_KEY` (base58). Was funded for the mainnet withdrawal test. Needs topping up to $500-1000 + 0.2-0.5 SOL for soft launch.

**Cold wallet:** Ledger Nano S Plus ordered from ledger.com (NOT Amazon). Holds bulk of bankroll once arrived.

**Open decisions / "probably next":**
- **Security P0s from the swarm research audit** (`swarm-research-for-launch/00-EXECUTIVE-SUMMARY.md`, §C + `33-auth-remediation-spec.md`) — highest priority. (a) `app/api/chat/send/route.ts` trusts body `userId` + `username` with no `verifyRequest()`; (b) `app/api/wallet/deposit/route.ts` trusts body `userId` + `walletAddress` fully unauthed (confused-deputy credit risk); (c) `CRON_SECRET` is optional — if unset, `/api/race/tick` + payout crons are public; (d) env-var boot assertions needed for `CRON_SECRET`, `PRIVY_APP_SECRET`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SALT`; (e) non-USDC SPL deposits silently lost in `lib/wallet/solana.ts:43-60` — user-fund-loss event, needs detect-and-warn; (f) TOCTOU race on per-horse liability cap in `race/bet/route.ts:71-91` — move check inside `place_race_bet_atomic` with `FOR UPDATE`; (g) `shortenOdds()` has zero callsites so "dynamic odds" claims are false — either wire it into `engine.ts` close flow or strike any such copy.
- **Tightening Privy loginMethods** — currently `["email", "google", "wallet"]` which includes Metamask. Filtering to Solana-only wallets would reduce the "signed in but wrong-chain wallet" footgun. Open question: worth the friction of fewer login options?
- **Admin SOL-balance monitor** — should alert when hot wallet SOL drops below 0.05 (withdrawals silently fail without gas). Not built.
- **Post-win share nudge** — growth lever discussed: auto-open X share sheet after a big win. Deferred to post-launch.
- **Cross-device referral attribution cookie** — localStorage-only attribution loses clicks when user clicks on mobile and signs up on desktop. Discussed, not built. Post-launch work.
- **Bonus tightening** — 3x wagering is very generous. Post-launch: if `bonus net cost` per user trends above $25, bump multiplier to 10x.

**Collaboration style reminders** (from memory, worth reinforcing):
- Connor pushes incrementally after each feature — don't batch. Migrations must be applied to Supabase manually BEFORE pushing code that depends on them (not the other way around, or users hit 500s).
- Solo dev / vibe coder — explanations should be business-impact first, then technical. Lean on markdown bullets.
- `no code pushing yet` means "don't commit/push" but still implement locally.

## Recent migrations applied to prod Supabase (April 2026)

- **018_username_changes.sql** ✅ applied — adds `users.username_changed_at` for the 7-day username edit cooldown.
- **019_referral_20pct_lifetime.sql** ✅ applied — updates `accrue_simple_referral_reward()` to pay 20% NGR lifetime (was 10% / 90-day window). Signature unchanged, safe to re-run.
- **020_loosen_bonus_rules.sql** ✅ applied — `UPDATE bonus_config` row: `max_bet_while_bonus` 5→100, `min_odds_to_count` 2.0→1.0.
- **021_bonus_payout_routing.sql** ✅ applied — adds `race_bets.from_bonus_amount` column, rewrites `place_race_bet_atomic` to persist the bonus portion of each stake, rewrites `settle_race` to route payouts based on the bonus ratio. This is the launch-blocker fix — without it, a user can win a bonus bet and withdraw immediately.
- **022_liability_cap_atomic.sql** ✅ applied (Terminal B, 2026-04-21) — rewrites `place_race_bet_atomic` to take a new optional `p_max_liability` param and do the per-horse liability aggregate inside the RPC under `SELECT … FOR UPDATE` on `race_entries`. Closes the TOCTOU race (Scout-1 T1: 10 concurrent $1 @ 100× could stack $1.6K against a $720 cap). CREATE OR REPLACE, idempotent, safe to re-run.
- **023_deposit_tx_signature_dedup.sql** ✅ applied (Terminal B, 2026-04-21) — partial `UNIQUE` index on `transactions(tx_hash) WHERE tx_hash IS NOT NULL` (replaces the old non-unique `idx_tx_hash`). Adds `deposit_addresses.last_processed_slot` cursor and `deposit_addresses.sol_baseline_lamports` for per-wallet deposit dedup. Every incoming USDC transfer signature now credits exactly once — concurrent retries hit a 23505 unique-violation and silently skip. **If rerunning ever:** check `SELECT tx_hash, count(*) FROM transactions WHERE tx_hash IS NOT NULL GROUP BY 1 HAVING count(*) > 1;` first — dups must be cleared before the unique index can be created.
- **024_bonus_cancel_and_wagering_fix.sql** ✅ applied (Terminal B, 2026-04-21) — `cancel_race_bet_atomic` RPC added (routes refund proportionally to cash/bonus, restores `wagering_remaining`, reverses `total_wagered`). `place_race_bet_atomic` rewritten again (now only decrements `wagering_remaining` when `v_from_bonus > 0` — closes the cash-wagering-to-unlock-bonus laundering path). `DROP FUNCTION IF EXISTS place_race_bet_atomic(8 args)` prevents overload coexistence.
- **025_self_referral_block.sql** ✅ applied (Terminal B, 2026-04-21) — `accrue_simple_referral_reward` rewritten to skip accrual when referrer and referred share `signup_fingerprint` / `signup_ip` / `normalized_email`. Writes an `admin_actions` audit row (`admin_identifier = 'system'`, `action_type = 'referral_self_block'`) on block so legitimate trips are reviewable. Note: the dedup-fields backfill for the non-bonus signup path lives in `app/api/auth/sync/route.ts` and is still uncommitted (tangled with Terminal A's email work).

All are `CREATE OR REPLACE FUNCTION` or `ADD COLUMN IF NOT EXISTS` style — safe to re-run.

## Bonus economics (for reference)

- $20 signup bonus, first 100 signups only (`bonus_config.signup_cap`), 14-day expiry
- 3x wagering ($60 total volume required to unlock bonus_balance → cash)
- Cash is always bet before bonus. Payouts routed proportionally by stake source.
- At ~9% house edge on $60 required wagering, expected house return ≈ $5.40 per bonus user. Net bonus cost ≈ $14.60 per user. Max aggregate loss ≈ $1.46K (100 × $14.60). Acceptable CAC.
- Retention after bonus clears determines whether this is profitable. Track `bonus net cost` per user post-launch; tighten multiplier to 10x if trending above $25/user.

## MVP launch checklist — what still needs to be done

### BEFORE LAUNCH

1. ✅ **Withdrawals tested on mainnet** (April 2026) — end-to-end working. Hot wallet is a Phantom wallet, private key in Vercel env as `HOT_WALLET_PRIVATE_KEY` (base58 format). Fund with 0.1 SOL + USDC for gas + float.
2. **Set NEXT_PUBLIC_IS_LIVE=true** in Vercel env when ready to go live — switches landing page CTA from waitlist to "start betting → /racing"
3. **Verify race animation works on production** after deploying the timing fix. The races must be visually watchable.
4. ✅ **Deposit flow works** — user connects Privy wallet, sends USDC to their embedded wallet address, clicks deposit, balance updates.
5. **Cold wallet setup** — Ledger Nano S Plus ordered from ledger.com. Move bulk of bankroll (~$8-9K of $10K) to cold once arrived. Hot stays funded with 1-2 weeks of expected withdrawal float (~$1-2K).
6. **Top up hot wallet to $500-1000** before soft launch. Also keep 0.2-0.5 SOL for gas.

### NOT doing before launch (accepted risk)

- ANTHROPIC_API_KEY — commentary is nice-to-have, settle flow has try/catch fallback
- Profanity filter — Connor's call 2026-04-21: "We're all adults here. Users should feel free." Revisit if moderation load demands it.
- Age gate (18+) — Connor's call 2026-04-21: "Security theatre without real verification — clicking Yes I'm over 18 means nothing. Revisit when we apply for a licence."
- Error tracking (Sentry) — console only for now
- Privacy policy — post-launch
- Email notifications — post-launch
- Sound design — Howler.js installed but sounds removed

### POST-LAUNCH (nice to have)

- Form guide page — Horse profiles exist as data but no dedicated /horses or /horse/[slug] page
- Tipster leaderboard — Schema supports it, UI not built
- Horse following + notifications — Not started
- Prediction streaks + badges — Not started
- Win card one-tap share to X — RaceWinCard component exists, verify share flow
- Telegram Mini-App — Future distribution channel for restricted markets
- Privacy policy page
- Age gate modal (when licence application begins)
- IPQS VPN/proxy detection (post-launch, pairs with licence application)
- Chainalysis sanctions screening on deposits (post-launch, pairs with licence application)

## Coding guidelines

- **Read before writing.** Always read a file before modifying it. Understand existing patterns.
- **Use existing patterns.** The codebase has consistent patterns for: Supabase queries (admin client for server, anon for client), auth verification (verifyRequest()), atomic balance updates (update_balance SQL function), Zustand stores, PostHog tracking.
- **verifyRequest() on all API routes.** Every user-facing API route must call verifyRequest() to verify the Privy JWT and get the user. No exceptions.
- **Atomic balance operations.** Always use the `update_balance()` SQL function for any balance change. Never do `UPDATE users SET balance = balance + X` directly.
- **Don't rebuild what exists.** Check lib/, components/, and hooks/ before creating new files.
- **Dark theme.** All UI uses the dark theme defined in globals.css. Brand colours: violet (#8B5CF6), magenta (#EC4899), cyan (#06B6D4) as accents on dark backgrounds.
- **Degen tone.** The product tone is crypto-degen/meme-y. Chat system messages, commentary, and UI copy should reflect this (e.g. "ABSOLUTE UNIT", "fr fr", "LFG").
- **No tests exist.** No test runner installed. Don't add tests unless explicitly asked.
- **Supabase is live.** Be careful with migrations — they run against the production database.
- **The race tick runs every minute via Vercel cron.** Don't change the tick endpoint signature or cron config without understanding the full race state machine in lib/racing/engine.ts.

## Environment variables required

```
# Supabase (set in both .env.local and Vercel)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# Privy (set in both .env.local and Vercel)
NEXT_PUBLIC_PRIVY_APP_ID
PRIVY_APP_SECRET

# Anthropic (for AI race commentary — currently empty, needs setting)
ANTHROPIC_API_KEY

# Solana hot wallet (for withdrawals — must be set in Vercel production env)
HOT_WALLET_PRIVATE_KEY
SOLANA_RPC_URL          # defaults to mainnet if not set

# Vercel cron protection
CRON_SECRET             # optional, protects /api/race/tick from public access

# Launch mode
NEXT_PUBLIC_IS_LIVE     # set to "true" to switch landing page from waitlist to live betting CTA

# FingerprintJS Pro (for signup abuse detection — set in Vercel prod only, local dev no-ops)
NEXT_PUBLIC_FINGERPRINT_PUBLIC_KEY   # from the "Public" tab on dashboard.fingerprint.com
FINGERPRINT_SECRET_KEY                # from the "Server API" tab — used to verify visitor IDs server-side

# Resend (transactional + retention emails — set in Vercel prod, optional locally)
RESEND_API_KEY           # from resend.com/api-keys
RESEND_WEBHOOK_SECRET    # from Resend dashboard once webhook endpoint configured; fail-closed in prod
EMAIL_FROM               # optional, defaults to "throws.gg <no-reply@throws.gg>"
EMAIL_REPLY_TO           # optional, defaults to "support@throws.gg"
NEXT_PUBLIC_APP_URL      # optional; base for unsubscribe links, defaults to https://throws.gg

# Geo-blocking (jurisdictional compliance — set in Vercel prod)
GEO_BYPASS_SECRET         # random ≥20 chars. Without it, /api/geo-bypass returns 503 — set BEFORE push or risk locking yourself out if Vercel misidentifies your IP.
INTERNAL_GEO_LOG_SECRET   # random ≥20 chars. Without it, geo-block still works but audit logging to admin_actions doesn't fire. Optional but recommended.
```
