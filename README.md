# SHARPRFI — MLB First-Inning Run Model (NRFI + YRFI)

A standalone MLB betting tool that models first-inning scoring for every game on the selected slate. A header toggle switches between the two sides of the same bet:

- **NRFI** (No Run First Inning) — probability neither team scores in the 1st
- **YRFI** (Yes Run First Inning) — probability at least one run scores in the 1st

The two views share one Poisson model: `P(YRFI) = 1 − P(NRFI)`. The API returns the canonical YRFI probability; the NRFI view derives its complement client-side (`lib/mode.ts`).

For each game it shows:
- The model's probability (%) for the active view, to two decimal places
- The **minimum American odds** needed at your sportsbook for a +EV bet on that side

No sportsbook integration — you compare the threshold against your own book and decide.

---

## App and URL

- **App name:** `sharprfi`
- **Production URL:** `https://sharprfi.vercel.app`
- **History:** merger of the former `bet-nrfi.vercel.app` and `bet-yrfi.vercel.app` sites (mirrored codebases; combined July 2026)

---

## Stack

- **Framework:** Next.js (App Router only)
- **UI:** React 19, Tailwind v4 (`@import "tailwindcss"`)
- **Language:** TypeScript
- **Cache:** Vercel KV (in-memory fallback for local dev)
- **Deployment:** Vercel

---

## Data Sources

| Source | What it provides | Auth |
|---|---|---|
| MLB Stats API (`statsapi.mlb.com/api/v1`) | Schedule, starting pitchers, pitcher season stats (FIP components), team OBP, lineup order, boxscore linescore | None |
| Baseball Savant (`baseballsavant.mlb.com`) | Pitcher barrel rate, hard-hit rate — season CSV, cached 12hr | None |
| Open-Meteo (`api.open-meteo.com`) | Temperature, wind speed, wind direction per venue (forecast for upcoming games, archive for backtests) | None |

All sources are free with no API key required.

---

## How the Model Works

Since July 2026 the headline probability is a **50/50 blend of two engines** (see `lib/model-config.ts`):

1. **Poisson model** (original) — expected first-inning runs (λ) per half-inning, described below.
2. **Monte Carlo simulation** (`lib/sim.ts`) — a batter-level engine contributed by Francisco Nevarez and adapted for this site: each confirmed batter's season wOBA (FanGraphs weights, shrunk toward league average by `min(PA/30, 1)`), platoon-adjusted against the starter's handedness, multiplied by the starter's shrunk OBP-allowed relative to league, √park factor, and a global calibration constant (`1.2333`, tuned so league-average inputs reproduce the 49.05% base rate). Each game is simulated 10,000 times with a seeded PRNG (seed = gamePk, deterministic), walks advancing runners only when forced and hits split 65/20/3/12 by type.

On the 2026-03-26 → 2026-07-05 backtest (1,344 games, `npm run backtest -- 2026-03-26 2026-07-05 --compare-sim`):

| Variant | Brier | Calibration gap |
|---|---|---|
| **Blend Poisson + Sim** | **0.2447** | +1.2% |
| Sim alone (no streaks) | 0.2463 | +3.5% |
| Poisson alone | 0.2476 | −1.1% |
| Sim + streak factors | 0.2538 | +7.8% |
| Original contributed script (as-coded) | 0.2577 | −10.3% |

Team-win-streak multipliers from the contributed model were tested and **rejected** (they hurt calibration). Both engines are shown side-by-side in each matchup's detail panel, along with a manual-odds EV calculator (implied probability, EV per unit, banded verdict).

### The Poisson engine

The Poisson engine uses a **Poisson distribution** to estimate expected first-inning runs (λ) per half-inning.

```
λ = 0.3371 × bounded_adjustment_score
```

The neutral baseline was recalibrated from every completed MLB regular-season game in 2023-2025, the post-pitch-clock sample: `3575` YRFI outcomes in `7290` games, or `49.05%` YRFI and `50.95%` NRFI. The adjustment score is built from stabilized pitcher FIP, K%, Savant barrel rate, team OBP, confirmed top-of-order OBP, park factor, and weather. Noisy early-season inputs use a larger stabilization sample that tapers linearly from `1.75x` on March 15 to `1.00x` by July 1, correlated factors are damped, and the combined adjustment is bounded to keep the model in a realistic MLB range.

**P(YRFI)** = 1 − P(home scores 0) × P(away scores 0) = 1 − e^(−λ_home) × e^(−λ_away)

Break-even American odds are derived from the probability:
- p ≥ 0.5 → negative odds (for example `-150 or better`)
- p < 0.5 → positive odds (for example `+163 or better`)

---

## Project Structure

```
app/
  page.tsx                   # Server component shell
  layout.tsx                 # Root layout, metadata, OG tags
  api/games/route.ts         # Main endpoint — all games with YRFI model output
  context/SettingsContext.tsx # User preferences (temp unit, wind unit, odds format, timezone)
  components/
    ClientShell.tsx          # Root client component; owns state + polling timers
    GameTable.tsx            # Ranked table (desktop) + card list (mobile)
    GameRow.tsx              # Single row: teams, pitchers, YRFI %, min odds, weather, result
    MatchupDetail.tsx        # Expandable model breakdown panel (pitchers, lineups, park/weather)
    DatePicker.tsx           # Today/tomorrow navigation (Pacific date anchor)
    StatusBar.tsx            # Last updated, game count, manual refresh
    LoadingSkeleton.tsx      # Loading state with elapsed timer
    ConfigPanel.tsx          # Preferences panel (temp, wind, odds format, timezone)
    MethodologyView.tsx      # Poisson model explainer tab
lib/
  types.ts                   # GameResult, GamesResponse, PitcherStats, BatterRow, WeatherData
  mlb-api.ts                 # Schedule, pitcher stats, team OBP, boxscore linescore, top-5 batters
  savant-api.ts              # Baseball Savant CSV fetch + KV cache (12hr TTL)
  weather-api.ts             # Open-Meteo fetch; hardcoded stadium lat/lon/outfieldFacing
  park-factors.ts            # Hardcoded runs park factors for all 30 stadiums (FanGraphs)
  poisson.ts                 # λ calculation, P(YRFI), break-even American odds
  model-breakdown.ts         # Per-factor multiplier computation for the detail panel
  game-status.ts             # getGameStatus(), computeFirstInningResult()
  cache.ts                   # createCache<T>(ttlMs) — in-memory TTL cache
  kv.ts                      # Vercel KV wrapper with in-memory fallback
  site.ts                    # getSiteUrl(), SITE_NAME
```

---

## KV Cache Schema

| Key | Value | TTL | Purpose |
|---|---|---|---|
| `games-response:v3:{date}` | `GamesResponse` | 5 min | Full compiled model output for the slate |
| `savant-pitchers:{year}` | `Record<string, SavantStats>` | 12 hr | Barrel rate + hard-hit rate by pitcher |

---

## Commands

```bash
npm run dev       # Start dev server at localhost:3000
npm run build     # Production build
npm run lint      # ESLint
npm test          # Jest (lib/ unit tests)
npm run backtest -- 2025-04-01 2025-04-30  # Historical calibration run
npx vercel --prod # Deploy to production
```

---

## UI Behavior

- **Date range:** Today and tomorrow (Pacific calendar day as anchor)
- **Auto-refresh:** API re-fetched every 5 minutes; UI clock updates every 60s (no extra API call)
- **Game groups:** Upcoming → In Progress → Settled
- **Responsive layout:** Mobile uses stacked game cards, condensed controls, and a card-based methodology view; desktop keeps the fixed-width ranked table layout
- **Matchup detail:** Tap or click any game row/card to expand an inline breakdown showing each pitcher's FIP/K%/Barrel%/λ, the confirmed top-5 lineup with stabilized OBP, and park/weather factor chips with direction and multiplier
- **Matchup labels:** Team nicknames only in table and mobile card views (for example, Yankees, Twins, Red Sox)
- **NRFI/YRFI toggle:** Segmented control in the header switches every view (probabilities, odds, sort order, result badge colors, accent theme, methodology copy). Choice persists in localStorage; first-time visitors land on YRFI. NRFI mode uses a red accent, YRFI green — preserving each original site's identity.
- **Probability colors:** green–yellow–red gradient anchored to each view's realistic model range (YRFI 44–60%, NRFI 45–62%); greener always means a stronger bet signal for the active side.
- **Probability display:** Percentages render to two decimal places
- **Result column:** Upcoming shows `—`, in-progress first innings show `IP`, scoring first innings show `RUN`, and scoreless first innings show `NO RUN`. The badge is green when the active view's bet wins (RUN in YRFI mode, NO RUN in NRFI mode) and red when it loses.
- **Desktop table alignment:** Temp, Wind, Time, and Result use centered fixed-width columns for uniform spacing
- **Mobile controls:** Today, Tomorrow, Preferences, and Methodology use the same compact pill treatment; the methodology tab keeps Back to games and Methodology aligned on one row with matched sizing
- **Estimate marker:** `~` prefixes the probability when one or both probable starters are still TBD or when a named starter still relies on fallback pitcher inputs
- **Odds availability:** Break-even odds are hidden only when a probable starter is still TBD
- **Lineup-aware adjustment:** If a confirmed batting order is posted, the model computes a probability-weighted average OBP for the first five hitters and compares it against the team baseline. Batters 1–3 are weighted 1.00 (guaranteed to bat); batter 4 is weighted 0.672 and batter 5 is weighted 0.366, derived from `P(X ≤ 2 | Binomial(n, 0.69))` — the probability each batter reaches the plate given the league out rate of 0.69 per PA. Individual batter names, stabilized OBP, and PA are exposed in the API response and shown in the matchup detail panel
- **Roofed/retractable parks:** Weather is neutralized and the UI shows `Roof`
- **Weather failure:** Factors default to 1.0; weather column shows `—`
- **Preferences:** Temperature unit, wind unit, odds format, timezone — persisted in localStorage alongside the NRFI/YRFI mode
- **Footer:** Links to lucasreydman.xyz, accented in the active view's color
- **Methodology math:** Formula blocks use smaller mobile typography so they stay visible without horizontal scrolling

---

## Out of Scope (v1)

- Sportsbook odds integration
- Parlay suggestions
- Discord notifications
- First-inning specific OBP splits (season OBP used as proxy)
- Admin lineup exclusions
