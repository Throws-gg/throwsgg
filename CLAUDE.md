@AGENTS.md

# throws.gg — Virtual Horse Racing Betting Platform

## What this is

A crypto-native virtual horse racing betting platform. Users deposit USDC/SOL via Privy embedded wallets, bet on virtual horse races with fixed odds (16 persistent horses, 8 per race), and withdraw winnings. We are the house. ~9% house edge via 1.10 overround (category norm for virtual sports is 8–15%). 480 races/day (one every 3 minutes). Provably fair via HMAC-SHA256. Odds priced strictly by `1 / (probability × overround)` — no clamps, no floors, no hierarchy patches.

**House edge policy:** We don't headline the exact overround in marketing copy, but we don't hide it either — the simulation is deterministic and users can verify outcomes via `/verify`. If asked: "Yes, ~9% overround — industry-standard for virtual sports. We aim to lower it as bankroll and volume grow." Never deny it. Never raise it silently — if it changes, announce it. **Don't surface implied probabilities on the race card** — that's just spelling out the edge to the user.

**Market positioning:** We are in the **virtual sports / virtual horse racing** category — NOT "AI horse racing". In all outbound copy (job posts, affiliate outreach, marketing, UI), lead with "virtual horse racing" or "virtual sports" — never "AI horse racing".

**Domain:** throws.gg
**Owner:** Connor — solo founder, vibe coder, uses Claude as the dev partner. Claude builds everything.
**Launch target:** Early May 2026. Code is launch-ready as of 2026-04-30. Remaining steps are operational (top up hot wallet, cold wallet setup, flip live flag).
**Bankroll:** $9K USD launch (`BANKROLL_RACING.INITIAL`). Max bet $100, min bet $0.10. Max race liability $750 per-horse-per-race (absolute, not ratio — replaced the 8% × bankroll ratio).

## Tech stack

- **Framework:** Next.js 16.2.1 (App Router) + React 19 + TypeScript
- **Database:** Supabase (Postgres + Realtime) — LIVE production project at nacxrrgqodaoudaqrknf.supabase.co
- **Auth:** Privy (embedded wallets, TEE-based — `useSigners` not `useDelegatedActions`)
- **Blockchain:** Solana — USDC-SPL deposits/withdrawals via Privy embedded wallets
- **State:** Zustand
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Animations:** Framer Motion + HTML Canvas (race animation)
- **AI Commentary:** Anthropic Claude API (post-race summaries — shelved, code-path falls back gracefully)
- **Analytics:** PostHog (client + server-side, PII scrubbed — wallet addresses hashed, balances bucketed)
- **Email:** Resend (14 templates, transactional wiring live, webhook + unsubscribe)
- **Anti-abuse:** FingerprintJS Pro (server-verified at signup)
- **Hosting:** Vercel — Privy app on Production tier (no 150-user cap)
- **Hot wallet pubkey:** `AUnU6WA1EXJwZnSHjiAWGzXzWn2As27XEAUmj7YFNxZT`
- **Hot wallet USDC ATA:** `4CRiR7oXUm6T2KvBHECChdjgrWBQ1n9PComjwrjykAQJ`

## Project structure

```
rps/
  app/
    page.tsx                        # Landing page. Two modes: waitlist (default) or live (NEXT_PUBLIC_IS_LIVE=true)
    layout.tsx                      # Root layout with Providers
    globals.css                     # Dark theme, brand colours
    (game)/
      racing/page.tsx               # Main racing page — bet, watch, results
      horses/page.tsx               # Form guide index — sortable + filterable
      horse/[slug]/page.tsx         # Per-horse profile + recent race history
      arena/page.tsx                # RPS game (not launching with this)
      leaderboard/page.tsx          # Tipster leaderboard, ROI ranked, 4 windows, top 10
      history/page.tsx              # Bet history
      verify/page.tsx               # Provably fair verification
    (account)/
      wallet/page.tsx               # Deposit + withdraw + recent transactions
      profile/page.tsx              # Profile w/ unified VIP ladder (rakeback-backed)
      settings/page.tsx             # Email preferences + global unsubscribe
      referrals/page.tsx            # Referral dashboard
    (admin)/admin/                  # Dashboard, users, races, affiliates, payouts, transactions, big-wins, chat, control, banner
    terms/page.tsx                  # Terms of Service
    privacy/page.tsx                # Privacy Policy
    responsible-gambling/page.tsx   # Self-exclusion + helplines
    affiliates/page.tsx             # Public affiliate application
    r/[code]/page.tsx               # Referral link handler
    [vanitySlug]/page.tsx           # Affiliate vanity URLs (admin-curated)
    blocked/page.tsx                # Geo-block landing (HTTP 451)
    unsubscribe/page.tsx            # One-tap email unsubscribe
    api/
      race/                         # state, tick, bet, bet/history, bet/cancel, horses, verify
      wallet/                       # deposit, withdraw, init-ata, sweep-status, delegate-confirm
      auth/sync/route.ts            # Bridge Privy JWT -> DB user; backfills wallet_address from Privy server SDK
      chat/send                     # Real-time chat
      user/me, /username, /email-preferences
      bonus/                        # status, daily/status, daily/claim
      rakeback/                     # status, claim
      referrals/                    # me, claim
      affiliates/                   # apply, click
      horses, horses/[slug]         # Public form guide endpoints
      transactions                  # User ledger for /wallet
      geo-bypass, internal/log-geo-block
      cron/                         # affiliate-tiers, affiliate-payouts, rakeback-nudge (weekly recap), weekly-leaderboard, streak-at-risk
      leaderboard, streak/          # Public leaderboard + streak status/top endpoints
      race/wins-feed                # Public live-wins ticker feed
      stats/public                  # Anonymous lifetime wagered + races settled + biggest 30d payout (60s edge cache)
      webhooks/resend               # Email delivery events
      admin/                        # 14+ admin endpoints
  lib/
    racing/                         # engine, simulation, odds-engine, commentary, constants, provably-fair
    auth/                           # privy.ts (TEE-aware, getSolanaEmbeddedAddress server lookup), verify-request, verify-admin
    wallet/
      solana.ts                     # Connection, USDC mint, balance + transfer fetchers
      send-usdc.ts                  # Hot wallet -> user (withdrawals)
      sweep.ts                      # User -> hot wallet (deposit sweep, fee-payer pattern, blockhash retry)
    bonus/, rakeback/               # Tier ladders (mirrored in SQL)
    email/                          # Resend client, templates (14), unsubscribe-token
    fingerprint/                    # Client + server visitor ID verification
    geo/blocklist.ts                # Country/region blocklist source of truth
    supabase/                       # client, admin, server
    chat/system-messages.ts
    analytics/                      # posthog (client + server, PII scrubbed)
  components/
    racing/                         # RaceCanvas, HorseSprite, RaceWinCard, PodiumResults, HeroRaceCard, LiveWinsTicker
    bonus/                          # DailyBonusCard, RakebackCard, SignupBonusModal, WageringProgress
    chat/                           # ChatFeed, ChatTicker
    wallet/                         # DepositPanel (with delegation gate), WithdrawPanel
    layout/                         # Navbar, MobileNav (5 tabs: racing/form/leaders/events/profile), Providers (PrivyAuthBridge)
    ui/                             # shadcn-style primitives
    game/                           # RPS components (not launching)
  hooks/
    useChat, useAuthedFetch, useSound, useDepositMonitor, useGlobalBalancePoller
  middleware.ts                     # Geo-block (uses lib/geo/blocklist.ts)
  next.config.ts                    # Security headers (X-Frame-Options DENY, HSTS, CSP report-only)
  supabase/migrations/              # 35 migrations applied to prod (latest: 035_daily_bet_streak)
  scripts/
    sim-fav-strategy.ts             # Replays last N settled races as if a user bet $100 on every favourite — read-only DB
    sim-odds-engine.ts              # End-to-end synthetic-race smoke test for the odds engine (per-bucket realised RTP)
    analyze-races.ts, simulate-odds.ts, bench.ts
  public/horses/                    # Sprite sheets (bodies, hair, face markings)
```

## Database schema (key tables)

- **users** — balance, bonus_balance, wagering_remaining, total_wagered, total_profit, role, is_banned, is_affiliate, referrer_id, signup_fingerprint/ip, normalized_email, sweep_delegated_at, sweep_revoked_at, ata_initialized_at, rakeback_claimable (legacy, drained by mig 033), rakeback_lifetime, current_streak, longest_streak, last_streak_day, last_streak_nudge_at, last_daily_claim_at, email_preferences (jsonb), email_unsubscribed_at, etc.
- **horses** — 16 persistent. speed/stamina/form/consistency, ground_preference, career stats, last_5_results (jsonb of `{raceNumber, position}`), distance/ground/gate records, speed_rating, avg_finish, days_since_last_race.
- **races** — race_number, status (betting/closed/racing/settled), distance, ground, server_seed, race_starts_at, financials.
- **race_entries** — gate_position, opening_odds, current_odds, true_probability, finish_position, power_score, snapshot_form.
- **race_bets** — amount, locked_odds, potential_payout, status, bet_type, from_bonus_amount.
- **transactions** — full audit trail (deposit, withdrawal, bet, payout, push_refund, bonus).
- **chat_messages** — real-time chat + system messages for race events / big wins.
- **referrals**, **referral_rewards**, **affiliate_applications**, **affiliate_periods**, **affiliate_clicks** — referral + affiliate flows.
- **deposit_addresses** — per-user cursor (last_processed_slot, sol_baseline_lamports) for deposit detection idempotency.
- **rakeback_accruals** — one row per settled bet, idempotent via UNIQUE(race_bet_id).
- **daily_claims** — one row per user per UTC day for the daily login bonus.
- **email_log** — per-send dedup + open/click/bounce timestamps.
- **admin_actions** — append-only audit (geo blocks, hot wallet alerts, referral self-blocks, affiliate approvals, etc).

Key SQL functions: `update_balance()` (atomic), `place_race_bet_atomic()` (handles cash + bonus split, liability cap under row lock), `cancel_race_bet_atomic()`, `settle_race()` (self-heals, accrues rakeback + bumps streak + referral rewards), `accrue_rakeback()` (instant credit to balance, cash-portion only, mig 033), `claim_rakeback()` (legacy back-compat shim post-033), `bump_bet_streak()` (UTC-day idempotent, mig 035), `tipster_leaderboard()` (ROI ranking by window, mig 034), `accrue_simple_referral_reward()` (20% NGR lifetime, with self-referral block), `daily_bonus_tier()`, `claim_daily_bonus()`, `rakeback_tier()`, `grant_signup_bonus()`, `normalize_email()`, `resolve_referral_code()`, `generate_referral_code()`.

## Race cycle (3 minutes)

```
[0:00 - 1:30]   BETTING — 90 seconds. Users see race card, place bets
[1:30 - 1:45]   CLOSED — 15 seconds. "Horses to gates"
[1:45 - 2:05]   RACING — 20 seconds. Canvas animation plays
[2:05 - 2:20]   RESULTS — 15 seconds. Finishing order, payouts, commentary
                Then immediately creates next race
```

Driven by Vercel cron hitting `/api/race/tick` every minute. Tick checks timestamps and advances the state machine. Multiple ticks per cycle are safe (idempotent transitions).

## What is DONE and shipped to prod (as of 2026-04-30)

Core gameplay:
- Race engine (create, close, simulate, settle), provably fair (HMAC-SHA256, deterministic), 16 horses with sprites, Monte Carlo odds (25,000 iterations default, 1.10 overround), atomic bet placement with bonus-aware accounting + per-horse liability cap, race animation with per-horse sprites + dust trails + winner glow, podium results screen.
- **Odds engine cleaned up (2026-04-29 → 04-30):** dropped Laplace prior + min/max odds clamps + hierarchy patches. Pricing is now exactly `decimal_odds = 1 / (empirical_probability × OVERROUND)` per horse. Only bound is `MAX_SUPPORTED_ODDS = MAX_RACE_LIABILITY / MIN_BET = 7,500×`, which is an operational cap (a longer payout is more than the bankroll can underwrite at min stake), not a pricing dial. `simulateRace` skips animation checkpoint generation when called from the Monte Carlo (`generateCheckpoints=false`), 10× pricing speedup. Per-priced-race cost ~300ms.
- Race card visual hierarchy (favourite/longshot chips, last-5 form pills, saddle-cloth gate numbers, odds tiered by size + colour). **Removed implied-win-% line under the odds — that just spelled out the house edge to the user.**
- **Race-card horse sprites all sit inside a circular frame** (white/14 hairline by default, silks-coloured ring when ground-match). Earlier inconsistency where only ground-match horses had a ring is fixed.
- Race animation timing fix (server `race_starts_at` + client optimistic phase advance — no more "0 seconds" stalls).

Wallet pipeline (the cashflow engine):
- Deposit detection (per-signature USDC dedup, SOL baseline-delta).
- Lazy backfill of `users.wallet_address` from the Privy server SDK on every deposit/init-ata call (handles TEE wallet provisioning latency).
- Auto-create user's USDC ATA on signup (hot wallet pays ~0.002 SOL rent, idempotent on-chain).
- **Privy delegated sweep** — users authorize via `useSigners().addSigners()`, server then calls `walletApi.solana.signAndSendTransaction` to move USDC from user wallet → hot wallet. Hot wallet is fee-payer (users never need SOL). Policy `sweep-usdc-prod` restricts the authorization key to USDC + transferChecked + hot ATA only — even if the key leaks, funds can only land at our treasury. Blockhash-expiry retry handles Privy round-trip latency. Gated on `SWEEP_ENABLED=true`. Idempotent (sweep on every deposit poll, no-ops at zero balance).
- Withdrawal flow (auto-send <$100, hold ≥$100 for review, weekly $2K cap, Solana-only address guard rejecting `0x...` paste, refund on confirmation failure, hot wallet SOL floor pre-flight check).
- Recent transactions list pulls from `/api/transactions`.

Auth + accounts:
- Privy auth (email + Google, no Metamask). TEE-aware — `useWallets` waits on `ready`. Server-side `getSolanaEmbeddedAddress` uses Privy SDK as authoritative source of truth (not client-supplied body fields).
- 11 historical users with null `wallet_address` were backfilled via migration 030.
- Username editing (3-20 chars, reserved-word check, 7-day cooldown).

Bonus + retention:
- Signup bonus ($20, first 100 only, 14-day expiry, 3x wagering, FingerprintJS dedup, IP/email dedup, self-referral block).
- Daily login bonus (Bronze $0.10 / Silver $0.20 / Gold $0.35 / Platinum $0.50 / Diamond $1.00 — same ladder as rakeback).
- Rakeback (5/10/15/20/25% of edge — at $0/$500/$5K/$25K/$100K wagered). **INSTANT auto-credit per settled bet (mig 033)** — no claim button. Bonus-funded stake portion is excluded; only cash wagering earns rakeback. Inline "+$0.04 rakeback" toast on the racing results screen. Weekly recap email instead of a claim nudge.
- Daily bet streak (mig 035) — consecutive UTC-days with ≥1 settled bet. Visible on /profile (current/longest/at-risk) and as `🔥N` next to chat handles. Streak-at-risk email at 20:00 UTC for ≥3-day streaks aged yesterday.
- Tipster leaderboard (mig 034) on `/leaderboard` — ranked by ROI on cash bets, 4 windows (day/week/month/all), min 10 bets + $50 staked to qualify. Bonus-funded stake excluded. Top 3 weekly get 🔥/⚡/✨ badges in chat. Weekly recap email Mondays 00:30 UTC (no prize pool at launch).
- Live wins ticker on landing (live mode) and racing page — pulled from `/api/race/wins-feed`, anonymous-readable, 10s edge cache, no fake data.
- Photo-finish near-miss line on lost bets when within 2 lengths of the payout cutoff: `1.4L from $42.00`.
- Inline "Verify this race yourself" CTA on the results screen → `/verify?race=N` (deep-link auto-runs once).
- Bonus cancel + payout routing (settle_race routes payouts proportionally to cash/bonus).
- Bonus rules loosened pre-launch (max-bet $100, min-odds 1.0).
- Cash + bonus combined betting (frictionless): client subscribes reactively, stake auto-caps to `min(amount, totalFunds, MAX_BET, liability)` on submit. UI shows split as `$X cash + $Y bonus`.

VIP / progression:
- Unified VIP ladder on `/profile` — same 5 tiers as rakeback (Bronze→Diamond at $0/$500/$5K/$25K/$100K). Headline perk per tier = rakeback rate. Each tier lists rakeback %, daily bonus tier, plus priority withdrawal review (Platinum+) and founder DM (Diamond). Every claim is a real perk shipped today.

Referrals + affiliates:
- 2-tier system: regular referrals (20% NGR lifetime) + approved affiliates (35-45% tiered NGR with weekly periods, hold, activation gate).
- Public application flow with admin review.
- Vanity affiliate links (`throws.gg/drake` → username lookup).
- Migration 032 added the missing `is_affiliate` column (collided with another 017 migration originally; fix unblocked /referrals 404, race settle classification, and admin approval).

Email:
- Resend integration, 14 templates, transactional wiring live (welcome, deposit, withdraw), category preferences UI, one-tap unsubscribe (Gmail/Yahoo compliant), webhook handler for opens/clicks/bounces/complaints.

Compliance + security:
- Geo-blocking middleware (~25 countries + sanctioned regions, HTTP 451, /blocked page, /api/geo-bypass for founder).
- Security headers (X-Frame-Options DENY, HSTS 2y+preload, CSP report-only with Privy/PostHog/Solana/Resend allowlist, Permissions-Policy).
- PostHog PII scrub (wallet addresses hashed, balances bucketed into tiers, tx hashes dropped).
- Atomic liability cap under `SELECT … FOR UPDATE` row lock (TOCTOU fix).
- Per-signature deposit dedup (UNIQUE partial index on transactions.tx_hash).
- Hot wallet SOL floor check (admin alert via `admin_actions` row when low).
- Self-referral block (fingerprint/IP/email dedup with audit logging).
- Bonus payout routing (closes the bonus-laundering withdrawal hole).

Legal pages:
- /terms, /privacy, /responsible-gambling all live and linked from footer.

Animations + UI:
- Race card visual upgrade (favourite/longshot, form pills, ground-match dot, saddle-cloth gates, tiered odds). Implied % line removed.
- Sprite render fix (legs no longer chopped — proper crop + aspect-preserved render).
- Form guide pages (/horses index, /horse/[slug] detail) — fixed React error #31 (last_5_results was rendering as object, now projected to position numbers in the API).
- Big win celebration overlay, share win card, podium results.

Landing page (rebuilt 2026-04-29 → 04-30):
- Editorial-trading-floor aesthetic. Geist (display, semibold) + JetBrains Mono (mono) + Outfit (body) via next/font. Section headers in confident sentence-case ("How a race runs", "Sixteen horses. Eight per race.", "Don't trust us. Verify the seed."), no more degen-meme register ("chaos pays / send it / get cooked" all gone). Hero lands on "A new race every three minutes. **Provably fair.**" — KYC framing demoted out of the hero (was reading like Stake/Rollbit affiliate copy).
- `<HeroRaceCard />` widget polls `/api/race/state` and renders three states (betting / racing / results) with countdown anchored to absolute server timestamps (`bettingClosesAt`, `raceStartsAt`) so cache hits can never tick the timer up. Footer pill shows the truncated `serverSeedHash` labelled `commit` pre-race / `seed` post-settle, deep-linking to `/verify`.
- `<LiveStatusBar />` above the hero with race # + countdown.
- Trust strip with three category-level facts pre-launch ("Race cycle · Settlement · Race fairness"). Post-launch (when `/api/stats/public` reports ≥50 settled races) it switches to lifetime wagered / races settled / biggest 30d payout. **Bankroll size and per-horse liability cap are NEVER surfaced** — those leak operational data.
- Form-guide rail: continuous left-scrolling marquee of all 16 horses with sprite cards, deep-linking to `/horse/[slug]`. 70s loop, pauses on hover.
- Recent results rail with per-row "verify →" links to `/verify?race=N`.
- 4-card "why" grid (provably fair / fixed odds / Solana-native / wallet-native).
- New `/api/stats/public` endpoint: anonymous-readable lifetime wagered + races settled + biggest 30d payout, 60s edge cache.
- Removed: fake `OddsTicker`, fake `LiveRacePreview` (both showed hardcoded data — instant trust kill on crypto Twitter), three blur-orbs hero background, scroll-down chevron.

Mobile chrome:
- Top header was squashing on mobile (balance + bonus + DEPOSIT + DE pill all jammed). Fix: bonus chip collapses to a gold dot, DEPOSIT button becomes "+" only, avatar pill drops chevron + padding. Full versions still render at `sm` breakpoint.
- Bottom mobile nav reworked: `racing · form · leaders · events · profile`. Wallet + Refer dropped (one tap further away via the avatar dropdown). Events tab is greyed with a `soon` pill — placeholder for the future events surface.

## Current operational state (what's left for launch)

**Operational, not code:**
1. **Top up hot wallet to ~$500–$1,000** + 0.2–0.5 SOL for fees before going live.
2. **Cold wallet setup** — Ledger Nano S Plus (when it arrives). Initialise offline, derive Solana address, document the manual sweep procedure (hot → cold via Phantom-with-Ledger when hot exceeds threshold). Site never touches cold.
3. **Flip `NEXT_PUBLIC_IS_LIVE=true` in Vercel** — switches landing page CTA from waitlist to "start betting → /racing".

**Accepted not-doing:**
- Anthropic API key for commentary (settle flow has try/catch fallback). Shelved indefinitely — Connor's call.
- Profanity filter (Connor: "we're all adults here").
- Age gate modal (security theatre without real ID verification — revisit at licence application).
- Sentry error tracking (console only for MVP).
- Sound design (Howler.js installed but no assets).

**Risk analysis (as of 2026-04-30):**
- Ran `scripts/sim-fav-strategy.ts` against last 1,000 settled races: a user betting $100 on the favourite every race for 1,000 races would lose $16,002 (16% realised edge), house bankroll would peak at $25K from $9K start, max house drawdown $383 (~4% of bankroll). Worst-strategy variance attack from a single user does not threaten the bankroll.
- Ran `scripts/sim-odds-engine.ts` end-to-end (5,000 synthetic races × 10,000 MC iterations) against the cleaned odds engine: overall RTP 93.5%, realised edge 6.5% (target 9.09%, gap is favourite-longshot bias of horse racing). No buckets show >100% RTP at the now-uncapped longshot tail. Engine is correctly priced to within Monte-Carlo sampling resolution.
- Real launch-window risks ranked: (1) sim-pricing exploit on a specific distance/ground/horse combo, (2) operational events (hot-wallet breach, signing-key leak, RPC outage), (3) the per-horse liability cap is hardcoded against `BANKROLL_RACING.INITIAL` not current bankroll — drawdowns don't shrink the cap. Item (3) is a known follow-up.

**Post-launch nice-to-haves:**
- Horse following + per-horse notifications ("Thunderbolt is racing in 5 min").
- Telegram bot for race alerts + unsettled winnings + VIP DM channel.
- Tier 1 retention: weekly Furlong Champions wager race (real prize pool), web push notifications, deposit insurance (25% back capped $25, first-deposit only), chat rain seeding.
- Telegram Mini-App distribution channel.
- IPQS VPN/proxy detection + Chainalysis sanctions screening (pair with Anjouan licence application).

## Important known constraints

1. **Existing 11 users from before 2026-04-25 didn't go through the delegation modal.** Their next /wallet visit will surface the violet "Authorize & continue" card. Until they delegate, their on-chain USDC won't sweep. Happens organically.
2. **`SWEEP_ENABLED=true` is on Production scope only.** If you ever test on Vercel preview deploys, set it there too.
3. **Privy app is on Production tier**, same app ID. There is no separate "Dev" environment to flip — config (signers, policies) is already live.
4. **Migration 039 is the latest applied to prod** (affiliate rollup credited_at). Migrations 036-039 are the 2026-04-29 security audit follow-up batch. All earlier migrations are also applied.

## Security audit (2026-04-29)

Five-agent deep audit of wallet, race engine, auth/RBAC, affiliate/referral/bonus, and infra/RLS. Findings ranked by exploit-impact. **All HIGH and CRITICAL items are now fixed in code + migrations 036-039 (applied to prod).** MEDIUM and LOW items remain.

### Fixed (code + migrations 036-039)

- **C1/H1 — Race result leak via /api/race/state.** `finishPosition` and `margin` were written to the DB the instant status flipped to 'racing' and exposed publicly for the entire 20s racing window. Anyone polling could read winners before the canvas played out. Now gated behind `status === 'settled'` (`app/api/race/state/route.ts:215-220`). Checkpoints are still exposed during racing because the canvas needs them to animate; reading them requires trajectory math, not a JSON glance.
- **C2 — SOL deposit baseline race.** Baseline advanced before `update_balance`; if the credit RPC errored, the deposit was silently lost. Fix: compensating UPDATE rolls the baseline back to its prior value when credit fails (`app/api/wallet/deposit/route.ts:207-241`). The rollback is gated on the baseline still equalling what we just wrote so concurrent successes aren't stomped.
- **#2 — Affiliate self-referral block.** Mig 025 only patched the simple 20% path. The affiliate path (35–45% NGR) had no dedup — could invert house edge to negative. Mig 036 mirrors the fingerprint/IP/email dedup into `accrue_referral_reward`.
- **#4 — AUTO_SEND_THRESHOLD.** Was $500, docs said $100. Set to **$250** based on $5K hot wallet float. Worst-case auto-drain per compromised account = 3 × $250 = $750/24h, ~15% of float. Bump to $500 when hot wallet float reaches ~$20K+ (`app/api/wallet/withdraw/route.ts:17-21`).
- **#5 — Concurrent-withdrawal TOCTOU.** "No pending withdrawals?" SELECT then INSERT had a race that let two concurrent requests both debit. Mig 036 adds partial UNIQUE index `(user_id) WHERE type='withdrawal' AND status='pending'`; route surfaces 409 on 23505 (`app/api/wallet/withdraw/route.ts:262-275`).
- **#6 — Idempotent withdrawal refund.** Both refund paths (`not_submitted` and on-chain `failed`) called `update_balance` then UPDATE-status with no transition guard. Vercel timeout + retry → double refund. Mig 037 introduces `withdrawal_refund_atomic` which claims the tx via `UPDATE … WHERE status != 'failed' RETURNING`. Both refund call sites now use it.
- **#7 — Affiliate rollup double-credit.** `rollup_weekly_periods` used `updated_at > NOW() - INTERVAL '1 day'` to find just-transitioned claimable rows; cron rerun re-credited the same period. Mig 039 adds `credited_at` column, replaces the rollup with a CTE-based `UPDATE … RETURNING` that atomically claims uncredited rows.
- **#9 — Bet history IDOR.** `/api/race/bet/history?userId=X` accepted the query param via `verifyRequest`'s dev-mode body. If `PRIVY_APP_SECRET` ever unset/typo'd in Vercel, this becomes a direct read of any user's bet history. Removed the fallback unconditionally (`app/api/race/bet/history/route.ts:13-19`).
- **#15 — referral_rewards UNIQUE on race_bet_id.** Settle re-ticks within the 15s results window could re-pay referral commissions. Mig 038 voids existing duplicates (status='voided' for audit), adds partial UNIQUE index, and wraps both accrual function INSERTs in `EXCEPTION WHEN unique_violation` for silent no-op.

### Verified clean (no exploit found)

- Auth coverage: every privileged route has `verifyRequest()` / `verifyAdmin()` / `verifyCron()`. No bypasses.
- Privy JWT properly verified (full JWKS signature + exp + iss + aud, not base64-decoded).
- Service role key server-only, not in any `NEXT_PUBLIC_*`.
- RLS enabled on all tables in migration 012; verify migrations 013-035 also enable RLS on tables they create (open follow-up).
- No `dangerouslySetInnerHTML` anywhere → chat XSS not exploitable.
- USDC mint validation correct; fake-mint deposits cannot credit as USDC.
- Atomic balance updates everywhere via `update_balance()`.
- Liability cap protected by `SELECT … FOR UPDATE` on race_entries (mig 022).
- `auth/sync` write-once for wallet/referrer; no account hijack.
- Hot wallet key never logged or exposed in error responses.
- No SSRF; Anthropic call uses no user-controlled URLs.

### Remaining audit items (not yet fixed)

Ranked by impact. None are launch-blockers, but worth working through pre-/post-launch.

**MEDIUM:**
- **#11** — `/api/race/state` calls `tick()` on public traffic. Bypasses CRON_SECRET intent, DoS/cost amplification, future tick non-idempotency becomes exploitable. Fix: stop calling `tick()` from the state endpoint, rely on the Vercel cron, or gate behind a server-side guard. (`app/api/race/state/route.ts:22, 50, 65, 69`)
- **#12** — SOL price fallback to hardcoded $150 if CoinGecko 5xx's. Mispricing window. Refuse to credit on stale oracle, or use Pyth/Switchboard as second oracle. (`lib/wallet/solana.ts:277-282`)
- **#13** — `getOrCreateAssociatedTokenAccount` paid by hot wallet — Sybil rotation bleeds ~0.002 SOL per fresh destination. Pre-flight check that destination is system-owned + reject ATA creation entirely (require user to have ATA). (`lib/wallet/send-usdc.ts:89-95`)
- **#14** — `last_processed_slot` advances past failed credits. Non-23505 errors permanently lose deposits. Only update for actually-processed signatures. (`app/api/wallet/deposit/route.ts:147-184, 231-237`)
- **#16** — Vanity slug squatting. Regex allows `admin`, `wallet`, `racing`, `api`, `r`, etc. Add reserved-slug list checked at insert. (`migrations/016_vanity_affiliate_slugs.sql:24`)
- **#17** — Affiliate application dedup doesn't normalize Gmail dots/+aliases. (`app/api/affiliates/apply/route.ts:101-114`)
- **#18** — CSP is `Report-Only` with `unsafe-inline` + `unsafe-eval`. Promote to enforcing pre-launch. (`next.config.ts:46`)
- **#19** — `from_bonus_amount` ratio not clamped in settle_race (defensive only — admin update could break it).

**LOW:**
- M3 — `total_wagered_since_signup` includes bonus-funded stake → 3× wagering activation gate clearable without real money. Exclude `from_bonus_amount` from the increment in `place_race_bet_atomic`.
- L1 — Hot wallet keypair re-decoded on every request. Cache after first load. (`lib/wallet/send-usdc.ts:26-32`)
- L5 — No Solana re-org handling at commitment="confirmed". Document the risk.
- Single shared admin password, no per-admin audit identity. Acceptable for solo founder; add per-admin TOTP once second admin exists.
- Admin login rate limit is in-memory, per-instance. Move to DB-backed counter.

**Open verification task:**
- Run `SELECT relname, relrowsecurity FROM pg_class WHERE relkind='r' AND relnamespace='public'::regnamespace` on prod. Confirm RLS is enabled on every table created by migrations 013-035 — especially `referrals`, `affiliate_clicks`, `rakeback_accruals`, `email_log`, `admin_actions`, `vanity_slugs`, `daily_claims`. Anything missed is anon-readable/writeable via the public anon key.

### Suggested next batch

Connor paused after #7. When picking back up, the most efficient next step is **#11 + #14 batched** — both small deposit/state route fixes, no migration needed. Then **#18 (enforce CSP)** before launch, and the RLS verification SQL one-liner. The remaining MEDs are post-launch hygiene.

## Recent migrations applied to prod (April 2026)

All `CREATE OR REPLACE` / `ADD COLUMN IF NOT EXISTS` style — safe to re-run.

- **018** — username changes cooldown
- **019** — referral 20% NGR lifetime (replaced the older 10%/90-day)
- **020** — loosen bonus rules (max-bet $100, min-odds 1.0)
- **021** — bonus payout routing (`from_bonus_amount` on race_bets, proportional payouts in settle)
- **022** — liability cap atomic (TOCTOU fix, FOR UPDATE on race_entries)
- **023** — deposit tx-signature dedup (UNIQUE partial index, deposit_addresses cursor + sol baseline)
- **024** — bonus cancel atomic + wagering counter fix (closes cash-wagering laundering)
- **025** — self-referral block (fingerprint/IP/email dedup with admin_actions audit)
- **026** — email infrastructure (users.email, email_preferences, email_log table)
- **027** — daily login bonus (daily_claims table, claim_daily_bonus, get_daily_bonus_status)
- **028** — rakeback (rakeback_accruals, rakeback_tier function, accrue/claim RPCs, settle_race rewrite)
- **029** — `users.ata_initialized_at` (sweep prerequisite)
- **030** — backfill `users.wallet_address` from `deposit_addresses.address` (one-shot, fixed 11 historical users)
- **031** — sweep delegation (`users.sweep_delegated_at`, `users.sweep_revoked_at` + partial index)
- **032** — `users.is_affiliate` add (collided with another 017; only the column add was needed since migration 019 already superseded the function rewrite from the original 017)
- **033** — instant rakeback. `accrue_rakeback` credits balance directly per settled bet, excludes bonus-funded stake portion, one-shot drain of legacy `rakeback_claimable` to balance with `rakeback_backfill_033` audit txs. `claim_rakeback` kept as back-compat shim.
- **034** — tipster leaderboard. `tipster_leaderboard(window, limit, min_bets, min_cash)` RPC + partial index on settled bets. Pure cash-skill ROI ranking.
- **035** — daily bet streak. `current_streak`/`longest_streak`/`last_streak_day`/`last_streak_nudge_at` columns + `bump_bet_streak()` called from `settle_race`. UTC-day idempotent.
- **036** — security audit fixes #1: affiliate-path self-referral block (mirrors mig 025 dedup logic into `accrue_referral_reward`); partial UNIQUE index on transactions `(user_id) WHERE type='withdrawal' AND status='pending'` to close the concurrent-withdrawal TOCTOU.
- **037** — idempotent withdrawal refund. New `withdrawal_refund_atomic(tx_id, reason, error_type, error_message, signature?)` SQL function — claims the tx via `UPDATE … WHERE status != 'failed' RETURNING` so retries (Vercel timeout, reconciliation tooling) become no-ops instead of double-crediting.
- **038** — referral_rewards UNIQUE on race_bet_id. Voids any pre-existing duplicates, adds partial UNIQUE index, and wraps both `accrue_referral_reward` + `accrue_simple_referral_reward` INSERTs in `EXCEPTION WHEN unique_violation` so settle_race re-ticks (within the 15s results window) become no-ops instead of paying commission twice.
- **039** — affiliate rollup credited_at. Adds `affiliate_periods.credited_at`; replaces `rollup_weekly_periods` with a CTE-based `UPDATE … RETURNING` pattern that atomically claims uncredited rows and only credits `users.referral_earnings` from those it claimed. Backfills existing claimable/paid rows so they don't re-credit. Closes the cron-rerun double-credit hole.

## Bonus economics (for reference)

- $20 signup bonus, first 100 signups only, 14-day expiry.
- 3x wagering ($60 volume to unlock).
- Cash bet first, then bonus. Payouts routed proportionally by stake source.
- Wagering only counts when the bet draws from bonus_balance (closes laundering).
- At ~9% house edge on $60 required wagering: expected house return ≈ $5.40/user. Net bonus cost ≈ $14.60/user. Max aggregate ≈ $1.46K (100 × $14.60). Acceptable CAC.

## Privy / Sweep architecture (critical context)

- **App is TEE-based.** `useDelegatedActions` and `useHeadlessDelegatedActions` are deprecated and throw. Use `useSigners().addSigners()` instead.
- **Two `NEXT_PUBLIC_*` env vars wire the client to the server-side signer:**
  - `NEXT_PUBLIC_PRIVY_SIGNER_ID` — public ID of the "Sweeping Key" authorization key (in `dashboard.privy.io` → Authorization).
  - `NEXT_PUBLIC_PRIVY_SWEEP_POLICY_ID` — public ID of the `sweep-usdc-prod` policy (in dashboard → Policies).
- **`PRIVY_AUTHORIZATION_KEY` (server-only secret)** — the private half of the Sweeping Key. Goes into `PrivyClient` constructor; required for `walletApi.solana.signAndSendTransaction` to succeed.
- **`SWEEP_ENABLED=true`** — kill switch. When false/unset, `sweepUserUsdc` returns `{status: "skipped_disabled"}`. Flip off if anything weird happens in prod — credits still land, USDC just sits at user wallet awaiting the next sweep.
- **Policy enforces** (cannot be bypassed even if the auth key leaks): TransferChecked instruction only, USDC mint only, destination = hot wallet ATA only.
- **Eventual consistency window:** after `addSigners` resolves on the client, Privy's read-side takes ~1-10s to propagate. Client polls `/api/wallet/delegate-confirm` every 1s for up to 15s with a "Verifying authorization…" UI state. Server itself retries getUserById internally for ~3s.

## Coding guidelines

- **Read before writing.** Always read a file before modifying. Understand existing patterns.
- **Use existing patterns.** Supabase queries (admin client server / anon client), `verifyRequest()` on every API route, `update_balance()` for any balance change, Zustand for state, PostHog tracking, dark theme + brand colours (violet #8B5CF6, magenta #EC4899, cyan #06B6D4).
- **`verifyRequest()` on all API routes.** Every user-facing API must verify the Privy JWT and look up the DB user. No exceptions.
- **Atomic balance operations.** Always use `update_balance()` SQL function. Never `UPDATE users SET balance = balance + X` directly.
- **Wallet address = server-side only.** Use `getSolanaEmbeddedAddress(privyDid)` from `lib/auth/privy.ts`. Never trust client-supplied `solanaAddress` body fields.
- **Don't rebuild what exists.** Check `lib/`, `components/`, `hooks/` before creating new files.
- **Tone of voice.** Confident + light personality, NOT meme-heavy. Reverted from the earlier "ABSOLUTE UNIT / LFG" tone. Sentence-case headings, no all-caps in UI copy. (See `feedback_tone_of_voice.md` in memory.)
- **Migration discipline.** Supabase is live. Apply migrations BEFORE pushing code that depends on them, not after — otherwise users hit 500s.
- **No tests exist.** No test runner installed. Don't add tests unless explicitly asked.
- **Race tick is every minute via Vercel cron.** Don't change the tick endpoint signature or cron config without understanding the full state machine in `lib/racing/engine.ts`.
- **Use ScheduleWakeup, not console.log debug loops.** When tracking down a prod bug, check Vercel logs and the live DB rather than adding `console.log` everywhere.

## Environment variables required

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# Privy auth + signing
NEXT_PUBLIC_PRIVY_APP_ID
PRIVY_APP_SECRET
PRIVY_AUTHORIZATION_KEY              # secret half of the "Sweeping Key" auth key — required for walletApi sweep
NEXT_PUBLIC_PRIVY_SIGNER_ID          # public ID of the "Sweeping Key" — client passes to addSigners
NEXT_PUBLIC_PRIVY_SWEEP_POLICY_ID    # public ID of the sweep-usdc-prod policy — client passes to addSigners

# Solana
HOT_WALLET_PRIVATE_KEY               # base58. Hot wallet pubkey: AUnU6WA1EXJwZnSHjiAWGzXzWn2As27XEAUmj7YFNxZT
SOLANA_RPC_URL                       # optional, defaults to mainnet-beta
SWEEP_ENABLED                        # "true" to enable on-chain sweeps. Anything else = skipped_disabled.

# Anthropic (optional, AI commentary — no-ops if empty)
ANTHROPIC_API_KEY

# Vercel cron protection
CRON_SECRET                          # required in prod

# Launch mode
NEXT_PUBLIC_IS_LIVE                  # "true" to switch landing page from waitlist to live betting

# FingerprintJS Pro
NEXT_PUBLIC_FINGERPRINT_PUBLIC_KEY
FINGERPRINT_SECRET_KEY

# Resend (transactional + retention email)
RESEND_API_KEY
RESEND_WEBHOOK_SECRET
EMAIL_FROM                           # optional, defaults "Connor at throws.gg <connor@throws.gg>"
EMAIL_REPLY_TO                       # optional, defaults connor@throws.gg
NEXT_PUBLIC_APP_URL                  # optional, base for unsubscribe links

# Geo-blocking
GEO_BYPASS_SECRET                    # founder bypass for /api/geo-bypass — set BEFORE going live
INTERNAL_GEO_LOG_SECRET              # optional, audit log for geo-blocked requests

# Admin
ADMIN_PASSWORD                       # ≥12 chars
ADMIN_SESSION_SALT                   # ≥32 chars (also used to sign unsubscribe tokens)
```

## Local working files (gitignored)

- `marketing/` — strategy + playbook docs
- `.agents/` — agent context
- `video/` — Remotion project (~710MB)
- `hiring/`, `va/`, `ops/`, `internal-docs/` — placeholder ignores for any future ops/HR/VA documentation we generate

## Past sessions — high-signal historical events

- **2026-04-21:** Pre-launch security audit shipped (Phase 1+2a+2b across `7da9c78` / `7f090da` / `60683dc` / `efa8595`). Closed ~14 launch-blockers including auth holes, race fairness leaks, money flow integrity, cash-wagering laundering. Boot-time env loader, dev-mode prod guards, atomic liability cap, deposit dedup, bonus cancel + routing, self-referral block.
- **2026-04-21 → 04-22:** Retention Phases 1, 2, 3, 4 shipped (rakeback, FingerprintJS, daily bonus, Resend emails). Phase 5 (streaks + leaderboard) deferred post-launch.
- **2026-04-22:** Form guide pages, geo-blocking middleware, email copy rewrite for deliverability.
- **2026-04-25:** Wallet-address null bug fixed (server-side Privy lookup); `useDelegatedActions` → `useSigners` migration for TEE wallets; full deposit→sweep pipeline shipped and verified end-to-end on mainnet ($1 USDC swept from user wallet to hot wallet ATA, signature `5k7sE6Gv...`).
- **2026-04-26:** Verifying-authorization UX (silent polling instead of scary 409 during Privy consistency window).
- **2026-04-27:** /referrals 404 fix (migration 032), /horses React #31 fix, /profile VIP rewrite (unified with rakeback ladder), privacy policy page, frictionless bet sizing (cash+bonus reactive subscription, auto-cap on submit, split surfaced in stake summary).
- **2026-04-28:** Tier 0 retention/engagement shipped across 4 commits. Migrations 033/034/035. Instant rakeback (no claim button, cash-portion only, +$X toast on settle). Tipster leaderboard ROI-ranked with 4 windows, top-3 chat flame badges. Daily bet streak (UTC-day, profile card, chat handle). Live wins ticker (real data, replaces orphan). Photo-finish near-miss framing on losing bets. Inline "Verify this race" CTA + deep-link auto-run. Three new crons (rakeback weekly recap repurposed, weekly leaderboard email, streak-at-risk daily 20:00 UTC).
- **2026-04-29:** Landing page rebuilt around real live race data. Deleted fake `OddsTicker` + `LiveRacePreview`, added `<HeroRaceCard />` driven by `/api/race/state`, swapped Fraunces light-italic display face for Geist semibold (better fit for crypto-native audience), restructured into 7 sections (live status bar, hero, trust strip, race-cycle timeline, form-guide marquee, recent results rail with per-row verify links, 4-card "why" grid, expanded footer). Fixed countdown drift by anchoring to absolute server deadlines instead of relative timeRemaining. Added `/api/stats/public` for trust-strip counters. Race-card sprite borders made consistent across all horses; mobile header de-squashed; bottom nav reworked to racing · form · leaders · events · profile.
- **2026-04-30:** Odds engine cleanup. Stripped Laplace prior + min/max odds clamps + win/place/show hierarchy patches. Pricing collapsed to one line: `1 / (probability × overround)`. Bumped default MC iterations from 4000 → 25,000 to nail down longshot tail resolution. Added `simulateRace(generateCheckpoints=false)` path so the Monte Carlo skips ~640k unused HMACs per priced race (~10× pricing speedup). Two analysis scripts shipped: `sim-fav-strategy.ts` (replays last N races against a max-stake-on-favourite user, no DB writes) and `sim-odds-engine.ts` (end-to-end synthetic-race smoke test, reports realised RTP per odds bucket). Removed implied-win-% line from the race card (was spelling out the house edge). Lowered `MAX_RACE_LIABILITY` from $720 (8% of bankroll ratio) to $750 absolute.
