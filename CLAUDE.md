@AGENTS.md

# throws.gg — Virtual Horse Racing Betting Platform

## What this is

A crypto-native virtual horse racing betting platform. Users deposit USDC/SOL via Privy embedded wallets, bet on virtual horse races with fixed odds (16 persistent horses, 8 per race), and withdraw winnings. We are the house. 3% effective house edge via 115-118% overround. 480 races/day (one every 3 minutes). Provably fair via HMAC-SHA256.

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

## Recent migrations applied to prod Supabase (April 2026)

- **018_username_changes.sql** ✅ applied — adds `users.username_changed_at` for the 7-day username edit cooldown.
- **019_referral_20pct_lifetime.sql** ✅ applied — updates `accrue_simple_referral_reward()` to pay 20% NGR lifetime (was 10% / 90-day window). Signature unchanged, safe to re-run.
- **020_loosen_bonus_rules.sql** ✅ applied — `UPDATE bonus_config` row: `max_bet_while_bonus` 5→100, `min_odds_to_count` 2.0→1.0.
- **021_bonus_payout_routing.sql** ✅ applied — adds `race_bets.from_bonus_amount` column, rewrites `place_race_bet_atomic` to persist the bonus portion of each stake, rewrites `settle_race` to route payouts based on the bonus ratio. This is the launch-blocker fix — without it, a user can win a bonus bet and withdraw immediately.

All four are `CREATE OR REPLACE FUNCTION` or `ADD COLUMN IF NOT EXISTS` style — safe to re-run.

## Bonus economics (for reference)

- $20 signup bonus, first 100 signups only (`bonus_config.signup_cap`), 14-day expiry
- 3x wagering ($60 total volume required to unlock bonus_balance → cash)
- Cash is always bet before bonus. Payouts routed proportionally by stake source.
- At 3% house edge, expected cost per bonus user: ~$18 EV negative. Max aggregate loss: $1.8K (100 × $18). Acceptable CAC.
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
- Profanity filter — empty BLOCKED_WORDS array in chat/send, will populate post-launch
- Age gate (18+) — defer to post-launch
- Geo-blocking (US, UK, AU, FR, NL) — defer to post-launch
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
- Geo-blocking implementation
- Age gate modal

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
```
