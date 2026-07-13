@AGENTS.md

# SHARPRFI — Project Context for Claude

## What This Project Is

A Next.js MLB betting tool that models first-inning scoring with **two engines** — the original Poisson model and a batter-level Monte Carlo simulation (contributed by Francisco Nevarez, July 2026) — and serves **both sides of the bet behind a header toggle**: NRFI (no run in the 1st) and YRFI (at least one run). The headline probability is a 50/50 blend (backtest winner; see `lib/model-config.ts` for the numbers). Users see each game's probability for the active view and the minimum American odds needed for a +EV bet. A manual-odds EV calculator lives in the matchup detail panel; no sportsbook integration.

Formerly two mirrored sites (bet-nrfi / bet-yrfi), merged in July 2026. The API computes the canonical YRFI probability; the NRFI view derives `1 − p`, its own break-even odds, sort order, colors, and copy client-side via `lib/mode.ts`. NRFI mode uses a red accent, YRFI green.

**Stack:** Next.js App Router, React 19, Tailwind v4, TypeScript, Vercel KV

---

## Critical: Next.js Version

This project uses a Next.js version with breaking changes from training data. **Always read `node_modules/next/dist/docs/` before writing any Next.js-specific code.** Heed deprecation notices. Do not assume App Router behavior matches what you know.

---

## Architecture

### Data Flow

1. `ClientShell` fetches `/api/games?date=YYYY-MM-DD` on mount and date change
2. Route checks `games-response:{date}` KV cache (5-min TTL) — returns immediately if hit
3. On cache miss: fetch MLB schedule → Savant barrel data (KV, 12hr TTL) → weather per venue → pitcher stats → team OBP → run Poisson model → attach first-inning result → sort by YRFI % → write to KV
4. Two independent client-side timers: re-fetch every 5 min (API call), re-render every 60s (clock update only)

### Key Files

| File | Role |
|---|---|
| `app/api/games/route.ts` | Main API endpoint — orchestrates all data fetching and model execution |
| `lib/poisson.ts` | λ calculation, P(YRFI) + P(NRFI), break-even odds |
| `lib/sim.ts` | Monte Carlo engine: wOBA + shrinkage + platoon + pitcher OBP-allowed, seeded PRNG (seed = gamePk), EV formulas |
| `lib/model-config.ts` | HEADLINE_MODEL ('blend') + SIM_USE_STREAKS (false) — set by `npm run backtest -- <range> --compare-sim` |
| `lib/mode.ts` | NRFI/YRFI view helpers: viewProbability, viewOdds, sortForMode, MODE_ACCENT classes |
| `lib/yrfi-color.ts`, `lib/nrfi-color.ts` | Probability text-color gradients, one normalization range per view |
| `lib/mlb-api.ts` | MLB Stats API calls (schedule, pitcher stats, team OBP, boxscore) |
| `lib/savant-api.ts` | Baseball Savant CSV fetch + KV cache |
| `lib/weather-api.ts` | Open-Meteo fetch; hardcoded stadium lat/lon/outfieldFacingDegrees for all 30 parks |
| `lib/park-factors.ts` | Hardcoded FanGraphs runs park factors (venueId → float, 1.00 = neutral) |
| `lib/game-status.ts` | `computeFirstInningResult()` — reads linescore innings[0] |
| `lib/kv.ts` | Vercel KV wrapper with in-memory fallback (always use this, never import KV directly) |
| `lib/types.ts` | All shared types: GameResult, PitcherStats, SavantStats, WeatherData, GamesResponse |
| `app/context/SettingsContext.tsx` | User preferences (mode, tempUnit, windUnit, oddsFormat, timezone) — localStorage backed (`sharprfi-settings`) |
| `app/components/ClientShell.tsx` | Root client component; owns all state and polling |

---

## Model Constants (in `lib/poisson.ts`)

```ts
BASE_LAMBDA = 0.3371   // recalibrated on 2023–2025 pitch-clock era backtest
LEAGUE_AVG_FIP = 3.80
LEAGUE_AVG_K_PCT = 0.23
LEAGUE_AVG_BARREL_PCT = 8.0   // 0–100 scale
LEAGUE_AVG_OBP = 0.310
FIP_CONSTANT = 3.10
```

Update these at the start of each season.

---

## Poisson Model Summary

```
λ_half = BASE_LAMBDA × FIP_factor × K%_factor × barrel_factor × OBP_factor × park_factor × temp_factor × wind_factor

P(YRFI) = 1 − e^(−λ_home) × e^(−λ_away)
P(NRFI) = 1 − P(YRFI)

headline = (P_poisson + P_sim) / 2      // lib/model-config.ts HEADLINE_MODEL='blend'
```

The sim engine (lib/sim.ts) is deterministic per game (mulberry32 seeded with gamePk) and calibrated so league-average inputs give 49.05% YRFI (`SIM_REACH_CALIBRATION = 1.2333`). Streak factors exist but are OFF — they hurt the backtest. Bump `RESPONSE_CACHE_VERSION` when GameResult shape changes (currently v4).

Wind factor requires `outfieldFacingDegrees` from the stadium constants in `weather-api.ts`. Wind direction from Open-Meteo is the direction the wind comes **from**.

---

## KV Cache Keys

| Key | TTL | Notes |
|---|---|---|
| `games-response:{date}` | 5 min | Full GamesResponse for the slate |
| `savant-pitchers:{year}` | 12 hr | `Record<string, SavantStats>` keyed by playerId.toString() |

---

## Edge Cases to Preserve

- **TBD pitchers:** `confirmed: false` on PitcherStats; use league-average stats; prefix YRFI % and odds with `~`
- **Weather failure:** `WeatherData.failure = true`; temp/wind factors default to 1.0; weather column shows `—`
- **Missing park factor:** Default to 1.00 (neutral)
- **Savant < 50 IP:** Fall back to league-average barrelRate (8.0) and hardHitRate (38.0)
- **PPD/cancelled games:** Filtered in schedule fetch via `g.status.detailedState` before model runs
- **Tomorrow:** Open-Meteo supports forecast; Savant uses current season stats (same KV entry)

---

## UI Conventions

- **Tailwind v4** — use `@import "tailwindcss"` syntax, not `@tailwind` directives
- **Color palette:** White base, slate for secondary text; mode-dependent accent via `MODE_ACCENT` in `lib/mode.ts` — `green-600` in YRFI mode, `red-600` in NRFI mode. Result badges are semantic (green = active view's bet won), MatchupDetail greens are semantic — never theme those by mode
- **Responsive:** `sm:hidden` / `hidden sm:block` pattern for mobile cards vs desktop table
- **Game grouping:** Upcoming → In Progress → Settled
- **Date anchor:** Pacific calendar day (`America/Los_Angeles`) for slate date
- **Matchup labels:** Use team nicknames in matchup display, not full city-plus-team names
- **Probability display:** Show the active view's percentage (YRFI or NRFI = 1 − YRFI) to two decimal places
- **Result states:** Upcoming = `—`, pending in-progress first inning = `IP`, run scored = `RUN`, scoreless first inning = `NO RUN`
- **Desktop compact columns:** Temp, Wind, Time, and Result are centered fixed-width columns for consistent alignment

---

## Commands

```bash
npm run dev       # localhost:3000
npm run build     # production build
npm run lint      # ESLint
npm test          # Jest (lib/ unit tests)
npx vercel --prod # deploy
```

---

## Full Spec

See [docs/superpowers/specs/2026-04-09-yrfi-design.md](docs/superpowers/specs/2026-04-09-yrfi-design.md) for the complete design spec including all formulas, types, and stadium constants.
