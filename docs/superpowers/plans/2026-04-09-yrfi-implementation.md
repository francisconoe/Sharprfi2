# YRFI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js 16 MLB betting tool that models YRFI (Yes Run First Inning) probability for every game on today's slate and displays the minimum American odds needed for a +EV bet.

**Architecture:** Fresh Next.js 16 App Router project with a single `/api/games` route that assembles pitcher stats (MLB Stats API + Baseball Savant), team OBP (MLB Stats API), and weather (Open-Meteo) into a Poisson model. Client renders a ranked table sorted by YRFI probability descending. Vercel KV caches the compiled response for 5 minutes.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, Vercel KV, Jest + ts-jest, MLB Stats API, Baseball Savant CSV, Open-Meteo API.

**Spec:** `docs/superpowers/specs/2026-04-09-yrfi-design.md`

---

## File Map

| File | Responsibility |
|---|---|
| `lib/types.ts` | All shared TypeScript interfaces |
| `lib/cache.ts` | In-memory TTL cache factory |
| `lib/kv.ts` | Vercel KV wrapper with in-memory fallback |
| `lib/site.ts` | `getSiteUrl()`, `SITE_NAME` |
| `lib/poisson.ts` | Poisson model: `computeLambda()`, `computeYrfiProbability()`, `breakEvenOdds()`, `formatOdds()` |
| `lib/game-status.ts` | `getGameStatus()`, `computeFirstInningResult()` |
| `lib/park-factors.ts` | Hardcoded `PARK_FACTORS` record (venueId → factor) |
| `lib/mlb-api.ts` | Schedule, pitcher stats, team OBP, linescore fetchers |
| `lib/savant-api.ts` | Baseball Savant CSV fetch, parse, KV cache |
| `lib/weather-api.ts` | Stadium constants, Open-Meteo fetch, weather factor helpers |
| `app/api/games/route.ts` | Main API endpoint — assembles all data, runs model, caches result |
| `app/components/LoadingSkeleton.tsx` | Loading state UI |
| `app/components/StatusBar.tsx` | Last updated, game count, refresh button |
| `app/components/DatePicker.tsx` | Today/tomorrow navigation |
| `app/components/GameRow.tsx` | Single desktop table row |
| `app/components/GameTable.tsx` | Full ranked table + stacked mobile card list |
| `app/components/ClientShell.tsx` | Root client component, state, two timers |
| `app/page.tsx` | Server component shell |
| `app/layout.tsx` | Root layout, metadata, OG tags |
| `app/globals.css` | Tailwind v4 import + base styles |
| `__tests__/poisson.test.ts` | Unit tests for Poisson model |
| `__tests__/game-status.test.ts` | Unit tests for game status helpers |
| `__tests__/savant-api.test.ts` | Unit tests for CSV parsing |
| `__tests__/weather-api.test.ts` | Unit tests for wind factor calculation |

---

## Task 1: Project Scaffold

**Files:**
- Create: all Next.js boilerplate files in `C:/Users/lucas/dev/yrfi/`
- Create: `jest.config.ts`
- Create: `jest.setup.ts`

- [ ] **Step 1: Scaffold Next.js into the existing directory**

```bash
cd C:/Users/lucas/dev/yrfi
npx create-next-app@latest . --typescript --eslint --no-tailwind --app --no-src-dir --no-turbopack --import-alias "@/*" --yes
```

When prompted about overwriting existing files, allow it (only `docs/` exists and won't be touched).

- [ ] **Step 2: Install Tailwind v4**

```bash
npm install tailwindcss@^4 @tailwindcss/postcss
```

- [ ] **Step 3: Install runtime dependencies**

```bash
npm install @vercel/kv papaparse
npm install --save-dev @types/papaparse
```

- [ ] **Step 4: Install Jest and ts-jest**

```bash
npm install --save-dev jest ts-jest @types/jest
```

- [ ] **Step 5: Create `jest.config.ts`**

```ts
import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
}

export default config
```

- [ ] **Step 6: Create `jest.setup.ts`** (empty for now)

```ts
// Jest global setup
```

- [ ] **Step 7: Add test script to `package.json`**

In `package.json`, ensure the `scripts` block includes:
```json
"test": "jest"
```

- [ ] **Step 8: Configure Tailwind v4 in `postcss.config.mjs`**

Replace the contents of `postcss.config.mjs` with:
```js
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
export default config
```

- [ ] **Step 9: Verify the scaffold builds**

```bash
npm run build
```

Expected: Build succeeds (may have warnings, no errors).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 16 project with Tailwind v4 and Jest"
```

---

## Task 2: Core Types and Infrastructure

**Files:**
- Create: `lib/types.ts`
- Create: `lib/cache.ts`
- Create: `lib/kv.ts`
- Create: `lib/site.ts`

No unit tests for these — they are thin wrappers or pure type definitions.

- [ ] **Step 1: Create `lib/types.ts`**

```ts
export interface SavantStats {
  playerId: number
  barrelRate: number       // barrel_batted_rate from CSV (0–100 scale)
  hardHitRate: number      // hard_hit_percent from CSV (0–100 scale) — reserved for v2
  inningsPitched: number   // used only for 50 IP qualification check
}

export interface PitcherStats {
  playerId: number
  name: string
  fip: number              // (13×HR + 3×(BB+HBP) − 2×K) / IP + 3.10
  kPct: number             // strikeouts / batters faced (0–1 scale)
  barrelRate: number       // from Savant; league avg fallback if < 50 IP or missing
  hardHitRate: number      // from Savant; league avg fallback
  confirmed: boolean       // false if TBD — league avg stats used
}

export interface WeatherData {
  tempF: number
  windSpeedMph: number
  windFromDegrees: number  // direction wind is coming FROM (Open-Meteo convention)
  failure: boolean         // true if fetch failed; model factors default to 1.0
}

export interface GameResult {
  gamePk: number
  gameTime: string         // ISO string
  gameStatus: 'upcoming' | 'inProgress' | 'settled'
  venue: string
  venueId: number
  homePitcher: PitcherStats
  awayPitcher: PitcherStats
  homeTeam: string
  awayTeam: string
  homeTeamId: number
  awayTeamId: number
  homeOBP: number          // season team OBP
  awayOBP: number
  lambda: { home: number; away: number }
  yrfiProbability: number  // 0–1
  breakEvenOdds: number    // American odds integer (positive or negative)
  weather: WeatherData
  firstInningResult: 'run' | 'no_run' | 'pending'
}

export interface GamesResponse {
  date: string             // YYYY-MM-DD
  games: GameResult[]
  generatedAt: string      // ISO timestamp
}

export interface GamesErrorResponse {
  error: string
  status: number
}
```

- [ ] **Step 2: Create `lib/cache.ts`**

```ts
interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export function createCache<T>(ttlMs: number) {
  const store = new Map<string, CacheEntry<T>>()

  return {
    get(key: string): T | undefined {
      const entry = store.get(key)
      if (!entry) return undefined
      if (Date.now() > entry.expiresAt) {
        store.delete(key)
        return undefined
      }
      return entry.value
    },
    set(key: string, value: T): void {
      store.set(key, { value, expiresAt: Date.now() + ttlMs })
    },
    delete(key: string): void {
      store.delete(key)
    },
  }
}
```

- [ ] **Step 3: Create `lib/kv.ts`**

```ts
import { kv } from '@vercel/kv'

const memoryStore = new Map<string, { value: unknown; expiresAt: number }>()

function isVercelKvAvailable(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

export async function kvGet<T>(key: string): Promise<T | null> {
  if (isVercelKvAvailable()) {
    return kv.get<T>(key)
  }
  const entry = memoryStore.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(key)
    return null
  }
  return entry.value as T
}

export async function kvSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  if (isVercelKvAvailable()) {
    if (ttlSeconds) {
      await kv.set(key, value, { ex: ttlSeconds })
    } else {
      await kv.set(key, value)
    }
    return
  }
  const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : Infinity
  memoryStore.set(key, { value, expiresAt })
}

export async function kvDel(key: string): Promise<void> {
  if (isVercelKvAvailable()) {
    await kv.del(key)
    return
  }
  memoryStore.delete(key)
}
```

- [ ] **Step 4: Create `lib/site.ts`**

```ts
function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

export function getSiteUrl(): string {
  const rawUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000')

  return stripTrailingSlash(rawUrl)
}

export const SITE_NAME = 'YRFI'
```

- [ ] **Step 5: Commit**

```bash
git add lib/
git commit -m "feat: add core types and infrastructure (cache, kv, site)"
```

---

## Task 3: Poisson Model (TDD)

**Files:**
- Create: `lib/poisson.ts`
- Create: `__tests__/poisson.test.ts`

- [ ] **Step 1: Create `__tests__/` directory and write failing tests**

Create `__tests__/poisson.test.ts`:

```ts
import {
  computeLambda,
  computeYrfiProbability,
  breakEvenOdds,
  formatOdds,
  tempFactor,
  windFactor,
} from '@/lib/poisson'

describe('tempFactor', () => {
  it('returns 0.92 for cold weather', () => {
    expect(tempFactor(45)).toBe(0.92)
  })
  it('returns 1.00 for neutral weather', () => {
    expect(tempFactor(65)).toBe(1.00)
  })
  it('returns 1.06 for hot weather', () => {
    expect(tempFactor(85)).toBe(1.06)
  })
  it('returns 1.00 at boundary 55', () => {
    expect(tempFactor(55)).toBe(1.00)
  })
  it('returns 1.00 at boundary 75', () => {
    expect(tempFactor(75)).toBe(1.00)
  })
})

describe('windFactor', () => {
  // outfieldFacing = 90° (outfield faces east)
  // wind FROM 90° = blowing in (toward home plate)
  // wind FROM 270° = blowing out (away from home plate, toward outfield)
  it('returns 0.93 for wind blowing in at 10+ mph', () => {
    expect(windFactor(15, 90, 90)).toBe(0.93)
  })
  it('returns 1.08 for wind blowing out at 10+ mph', () => {
    expect(windFactor(15, 270, 90)).toBe(1.08)
  })
  it('returns 1.00 for crosswind', () => {
    expect(windFactor(15, 180, 90)).toBe(1.00)
  })
  it('returns 1.00 for calm wind below 10 mph', () => {
    expect(windFactor(5, 270, 90)).toBe(1.00)
  })
  it('handles wrap-around: outfield faces 10°, wind from 355° is blowing in', () => {
    expect(windFactor(15, 355, 10)).toBe(0.93)
  })
})

describe('computeLambda', () => {
  const avgInputs = {
    pitcherFip: 3.80,
    pitcherKPct: 0.23,
    pitcherBarrelRate: 8.0,
    teamOBP: 0.310,
    parkFactor: 1.00,
    tempF: 65,
    windSpeedMph: 0,
    windFromDegrees: 0,
    outfieldFacingDegrees: 0,
  }

  it('returns base lambda (0.50) for all-average inputs', () => {
    const result = computeLambda(avgInputs)
    expect(result).toBeCloseTo(0.50, 2)
  })

  it('produces higher lambda for a bad pitcher (FIP 5.5)', () => {
    const result = computeLambda({ ...avgInputs, pitcherFip: 5.5 })
    expect(result).toBeGreaterThan(0.50)
  })

  it('produces lower lambda for an elite pitcher (FIP 2.5)', () => {
    const result = computeLambda({ ...avgInputs, pitcherFip: 2.5 })
    expect(result).toBeLessThan(0.50)
  })

  it('produces higher lambda for high barrel rate (12%)', () => {
    const result = computeLambda({ ...avgInputs, pitcherBarrelRate: 12 })
    expect(result).toBeGreaterThan(0.50)
  })

  it('produces lower lambda for low barrel rate (4%)', () => {
    const result = computeLambda({ ...avgInputs, pitcherBarrelRate: 4 })
    expect(result).toBeLessThan(0.50)
  })

  it('produces higher lambda for Coors Field (park factor 1.30)', () => {
    const result = computeLambda({ ...avgInputs, parkFactor: 1.30 })
    expect(result).toBeCloseTo(0.65, 2)
  })

  it('clamps K% factor between 0.85 and 1.15', () => {
    // K% = 0 (extreme) — K% factor should be clamped to 1.15
    const highResult = computeLambda({ ...avgInputs, pitcherKPct: 0 })
    // K% = 0.50 (extreme) — K% factor should be clamped to 0.85
    const lowResult = computeLambda({ ...avgInputs, pitcherKPct: 0.50 })
    // Both should be clamped, not produce wild values
    expect(highResult).toBeLessThan(computeLambda({ ...avgInputs, pitcherKPct: 0.01 }) * 1.01)
    expect(lowResult).toBeGreaterThan(computeLambda({ ...avgInputs, pitcherKPct: 0.49 }) * 0.99)
  })
})

describe('computeYrfiProbability', () => {
  it('returns correct YRFI probability from two lambdas', () => {
    // P(YRFI) = 1 - e^(-0.5) * e^(-0.5) = 1 - e^(-1) ≈ 0.6321
    const result = computeYrfiProbability(0.50, 0.50)
    expect(result).toBeCloseTo(0.6321, 3)
  })

  it('returns higher probability when lambdas are higher', () => {
    expect(computeYrfiProbability(1.0, 1.0)).toBeGreaterThan(computeYrfiProbability(0.5, 0.5))
  })

  it('returns value between 0 and 1', () => {
    const result = computeYrfiProbability(0.3, 0.4)
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThan(1)
  })
})

describe('breakEvenOdds', () => {
  it('returns negative odds for p >= 0.5 (favorite)', () => {
    expect(breakEvenOdds(0.60)).toBe(-150)
  })
  it('returns positive odds for p < 0.5 (underdog)', () => {
    expect(breakEvenOdds(0.40)).toBe(150)
  })
  it('returns -100 at exactly p = 0.5', () => {
    expect(breakEvenOdds(0.50)).toBe(-100)
  })
  it('uses Math.ceil (rounds up for conservative threshold)', () => {
    // p = 0.45 → 100*(0.55)/0.45 = 122.22 → ceil → 123
    expect(breakEvenOdds(0.45)).toBe(123)
  })
})

describe('formatOdds', () => {
  it('formats negative odds as "-150 or better"', () => {
    expect(formatOdds(-150, false)).toBe('-150 or better')
  })
  it('formats positive odds as "+150 or better"', () => {
    expect(formatOdds(150, false)).toBe('+150 or better')
  })
  it('formats -100 as "+100 or better" (even money)', () => {
    expect(formatOdds(-100, false)).toBe('+100 or better')
  })
  it('prefixes with ~ for unconfirmed pitchers', () => {
    expect(formatOdds(150, true)).toBe('~+150 or better')
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test -- --testPathPattern=poisson
```

Expected: FAIL — `Cannot find module '@/lib/poisson'`

- [ ] **Step 3: Create `lib/poisson.ts`**

```ts
export const LEAGUE_AVG_FIP = 3.80
export const LEAGUE_AVG_K_PCT = 0.23
export const LEAGUE_AVG_BARREL_PCT = 8.0
export const LEAGUE_AVG_OBP = 0.310
export const BASE_LAMBDA = 0.50
export const FIP_CONSTANT = 3.10
export const LEAGUE_AVG_HARD_HIT_PCT = 38.0

export function tempFactor(tempF: number): number {
  if (tempF < 55) return 0.92
  if (tempF > 80) return 1.06
  return 1.00
}

export function windFactor(
  windSpeedMph: number,
  windFromDegrees: number,
  outfieldFacingDegrees: number,
): number {
  if (windSpeedMph < 10) return 1.00

  let delta = Math.abs(windFromDegrees - outfieldFacingDegrees) % 360
  if (delta > 180) delta = 360 - delta

  if (delta <= 45) return 0.93   // blowing in
  if (delta >= 135) return 1.08  // blowing out
  return 1.00                    // crosswind
}

export interface LambdaParams {
  pitcherFip: number
  pitcherKPct: number        // 0–1 scale
  pitcherBarrelRate: number  // 0–100 scale
  teamOBP: number
  parkFactor: number
  tempF: number
  windSpeedMph: number
  windFromDegrees: number
  outfieldFacingDegrees: number
}

export function computeLambda(params: LambdaParams): number {
  const {
    pitcherFip,
    pitcherKPct,
    pitcherBarrelRate,
    teamOBP,
    parkFactor,
    tempF,
    windSpeedMph,
    windFromDegrees,
    outfieldFacingDegrees,
  } = params

  const fipFactor = pitcherFip / LEAGUE_AVG_FIP

  const rawKFactor = 1 + 0.3 * (LEAGUE_AVG_K_PCT - pitcherKPct) / LEAGUE_AVG_K_PCT
  const kFactor = Math.max(0.85, Math.min(1.15, rawKFactor))

  const barrelFactor = pitcherBarrelRate / LEAGUE_AVG_BARREL_PCT

  const obpFactor = teamOBP / LEAGUE_AVG_OBP

  const tf = tempFactor(tempF)
  const wf = windFactor(windSpeedMph, windFromDegrees, outfieldFacingDegrees)

  return BASE_LAMBDA * fipFactor * kFactor * barrelFactor * obpFactor * parkFactor * tf * wf
}

export function computeYrfiProbability(lambdaHome: number, lambdaAway: number): number {
  const pHomeScores0 = Math.exp(-lambdaHome)
  const pAwayScores0 = Math.exp(-lambdaAway)
  return 1 - pHomeScores0 * pAwayScores0
}

export function breakEvenOdds(p: number): number {
  if (p >= 0.5) return -Math.ceil((100 * p) / (1 - p))
  return Math.ceil((100 * (1 - p)) / p)
}

export function formatOdds(odds: number, estimated: boolean): string {
  // -100 is even money — display as +100
  const display = odds === -100 ? '+100' : odds > 0 ? `+${odds}` : `${odds}`
  const prefix = estimated ? '~' : ''
  return `${prefix}${display} or better`
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npm test -- --testPathPattern=poisson
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/poisson.ts __tests__/poisson.test.ts
git commit -m "feat: add Poisson model with full test coverage"
```

---

## Task 4: Game Status Helpers (TDD)

**Files:**
- Create: `lib/game-status.ts`
- Create: `__tests__/game-status.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/game-status.test.ts`:

```ts
import { getGameStatus, computeFirstInningResult } from '@/lib/game-status'

describe('getGameStatus', () => {
  it('returns upcoming for Pre-Game', () => {
    expect(getGameStatus('Pre-Game')).toBe('upcoming')
  })
  it('returns upcoming for Scheduled', () => {
    expect(getGameStatus('Scheduled')).toBe('upcoming')
  })
  it('returns upcoming for Warmup', () => {
    expect(getGameStatus('Warmup')).toBe('upcoming')
  })
  it('returns inProgress for In Progress', () => {
    expect(getGameStatus('In Progress')).toBe('inProgress')
  })
  it('returns inProgress for Manager Challenge', () => {
    expect(getGameStatus('Manager Challenge')).toBe('inProgress')
  })
  it('returns settled for Final', () => {
    expect(getGameStatus('Final')).toBe('settled')
  })
  it('returns settled for Game Over', () => {
    expect(getGameStatus('Game Over')).toBe('settled')
  })
  it('returns settled for Completed Early', () => {
    expect(getGameStatus('Completed Early')).toBe('settled')
  })
})

describe('computeFirstInningResult', () => {
  it('returns run when away team scored', () => {
    const linescore = { innings: [{ away: { runs: 2 }, home: { runs: 0 } }] }
    expect(computeFirstInningResult(linescore)).toBe('run')
  })
  it('returns run when home team scored', () => {
    const linescore = { innings: [{ away: { runs: 0 }, home: { runs: 1 } }] }
    expect(computeFirstInningResult(linescore)).toBe('run')
  })
  it('returns run when away scored even if home not yet defined', () => {
    const linescore = { innings: [{ away: { runs: 1 } }] }
    expect(computeFirstInningResult(linescore)).toBe('run')
  })
  it('returns no_run when both halves complete and scoreless', () => {
    const linescore = { innings: [{ away: { runs: 0 }, home: { runs: 0 } }] }
    expect(computeFirstInningResult(linescore)).toBe('no_run')
  })
  it('returns pending when inning 1 data is absent', () => {
    const linescore = { innings: [] }
    expect(computeFirstInningResult(linescore)).toBe('pending')
  })
  it('returns pending when away complete with 0 runs but home not yet started', () => {
    const linescore = { innings: [{ away: { runs: 0 } }] }
    expect(computeFirstInningResult(linescore)).toBe('pending')
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test -- --testPathPattern=game-status
```

Expected: FAIL — `Cannot find module '@/lib/game-status'`

- [ ] **Step 3: Create `lib/game-status.ts`**

```ts
type GameStatus = 'upcoming' | 'inProgress' | 'settled'
type FirstInningResult = 'run' | 'no_run' | 'pending'

const UPCOMING_STATES = new Set(['Pre-Game', 'Scheduled', 'Warmup', 'Preview'])
const IN_PROGRESS_STATES = new Set(['In Progress', 'Manager Challenge', 'Delayed', 'Delay'])
const SETTLED_STATES = new Set(['Final', 'Game Over', 'Completed Early', 'Postponed Completed'])

export function getGameStatus(detailedState: string): GameStatus {
  if (UPCOMING_STATES.has(detailedState)) return 'upcoming'
  if (IN_PROGRESS_STATES.has(detailedState)) return 'inProgress'
  if (SETTLED_STATES.has(detailedState)) return 'settled'
  // Default: treat unknown states as upcoming
  return 'upcoming'
}

interface InningHalf {
  runs?: number
}

interface InningData {
  away?: InningHalf
  home?: InningHalf
}

interface Linescore {
  innings: InningData[]
}

export function computeFirstInningResult(linescore: Linescore): FirstInningResult {
  const inning1 = linescore.innings[0]
  if (!inning1) return 'pending'

  const awayRuns = inning1.away?.runs
  const homeRuns = inning1.home?.runs

  // If away scored, it's a run immediately (even if home hasn't batted)
  if (awayRuns !== undefined && awayRuns > 0) return 'run'
  if (homeRuns !== undefined && homeRuns > 0) return 'run'

  // Both halves complete and scoreless
  if (awayRuns !== undefined && homeRuns !== undefined) return 'no_run'

  // Incomplete
  return 'pending'
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npm test -- --testPathPattern=game-status
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/game-status.ts __tests__/game-status.test.ts
git commit -m "feat: add game status helpers with full test coverage"
```

---

## Task 5: Park Factors

**Files:**
- Create: `lib/park-factors.ts`

No unit tests — static data lookup.

- [ ] **Step 1: Create `lib/park-factors.ts`**

Source: FanGraphs Park Factors (1.00 scale; 1.00 = neutral). Update each season.
Keyed by MLB Stats API `venueId`. Look up unknown venues via `https://statsapi.mlb.com/api/v1/venues`.

```ts
// FanGraphs runs park factors, 1.00 scale. Updated for 2025 season.
// To find a venue ID: GET https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=YYYY-MM-DD&hydrate=venue
const PARK_FACTORS: Record<number, number> = {
  2: 0.97,    // Oriole Park at Camden Yards (BAL)
  3: 1.02,    // Fenway Park (BOS)
  4: 0.96,    // Guaranteed Rate Field (CWS)
  5: 0.97,    // Progressive Field (CLE)
  7: 1.00,    // Kauffman Stadium (KC)
  10: 0.97,   // Oakland Coliseum (OAK)
  12: 0.96,   // Tropicana Field (TB) — dome
  14: 1.00,   // Rogers Centre (TOR) — dome
  15: 1.03,   // Chase Field (ARI) — dome/retractable
  17: 1.04,   // Wrigley Field (CHC)
  19: 1.28,   // Coors Field (COL)
  22: 0.93,   // Dodger Stadium (LAD)
  31: 0.96,   // PNC Park (PIT)
  32: 1.01,   // American Family Field (MIL) — retractable
  680: 0.95,  // T-Mobile Park (SEA)
  2392: 1.01, // Minute Maid Park (HOU) — retractable
  2394: 0.97, // Comerica Park (DET)
  2395: 0.90, // Oracle Park (SF)
  2602: 1.00, // Great American Ball Park (CIN)
  2680: 0.88, // Petco Park (SD)
  2681: 1.00, // Citizens Bank Park (PHI)
  2889: 0.96, // Busch Stadium (STL)
  3289: 1.01, // Citi Field (NYM)
  3309: 1.01, // Nationals Park (WSH)
  3312: 1.00, // Target Field (MIN)
  3313: 1.02, // Yankee Stadium (NYY)
  4169: 0.94, // loanDepot park (MIA) — retractable
  4705: 1.00, // Truist Park (ATL)
  5325: 1.05, // Globe Life Field (TEX) — retractable
}

export function getParkFactor(venueId: number): number {
  return PARK_FACTORS[venueId] ?? 1.00
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/park-factors.ts
git commit -m "feat: add park factors table (FanGraphs 1.00 scale, 2025)"
```

---

## Task 6: MLB API Helpers

**Files:**
- Create: `lib/mlb-api.ts`

Integration-only (network calls) — no unit tests. Manual verification via `npm run dev`.

- [ ] **Step 1: Create `lib/mlb-api.ts`**

```ts
const MLB_BASE = 'https://statsapi.mlb.com/api/v1'

// --- Schedule ---

export interface MlbScheduleGame {
  gamePk: number
  gameDate: string
  status: { detailedState: string }
  venue: { id: number; name: string }
  teams: {
    home: {
      team: { id: number; name: string }
      probablePitcher?: { id: number; fullName: string }
    }
    away: {
      team: { id: number; name: string }
      probablePitcher?: { id: number; fullName: string }
    }
  }
}

export async function fetchSchedule(date: string): Promise<MlbScheduleGame[]> {
  const url = `${MLB_BASE}/schedule?sportId=1&date=${date}&hydrate=probablePitcher,lineups`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Schedule fetch failed: ${res.status}`)
  const data = await res.json()
  const games: MlbScheduleGame[] = data.dates?.[0]?.games ?? []
  // Filter PPD/cancelled
  return games.filter(
    g => !['Postponed', 'Cancelled', 'Suspended'].includes(g.status.detailedState)
  )
}

// --- Pitcher stats ---

export interface MlbPitcherStatLine {
  homeRuns: number
  baseOnBalls: number
  hitByPitch: number
  strikeOuts: number
  inningsPitched: string  // e.g. "85.2" = 85 2/3 innings
  battersFaced: number
}

function parseIP(ip: string): number {
  const parts = ip.split('.')
  return parseInt(parts[0], 10) + (parseInt(parts[1] ?? '0', 10)) / 3
}

function calcFip(stat: MlbPitcherStatLine): number {
  const ip = parseIP(stat.inningsPitched)
  if (ip === 0) return 3.80 // fallback to league avg
  return (13 * stat.homeRuns + 3 * (stat.baseOnBalls + stat.hitByPitch) - 2 * stat.strikeOuts) / ip + 3.10
}

function calcKPct(stat: MlbPitcherStatLine): number {
  if (stat.battersFaced === 0) return 0.23
  return stat.strikeOuts / stat.battersFaced
}

export async function fetchPitcherStatLine(
  playerId: number,
  season: number
): Promise<MlbPitcherStatLine | null> {
  const url = `${MLB_BASE}/people/${playerId}/stats?stats=season&group=pitching&season=${season}`
  const res = await fetch(url, { next: { revalidate: 300 } })
  if (!res.ok) return null
  const data = await res.json()
  return data.stats?.[0]?.splits?.[0]?.stat ?? null
}

export async function fetchPitcherFipAndKPct(
  playerId: number,
  season: number
): Promise<{ fip: number; kPct: number }> {
  const stat = await fetchPitcherStatLine(playerId, season)
  if (!stat) return { fip: 3.80, kPct: 0.23 }
  return { fip: calcFip(stat), kPct: calcKPct(stat) }
}

// --- Team OBP ---

export async function fetchTeamOBP(teamId: number, season: number): Promise<number> {
  const url = `${MLB_BASE}/teams/${teamId}/stats?stats=season&group=hitting&season=${season}`
  const res = await fetch(url, { next: { revalidate: 300 } })
  if (!res.ok) return 0.310
  const data = await res.json()
  const obp = data.stats?.[0]?.splits?.[0]?.stat?.obp
  return obp ? parseFloat(obp) : 0.310
}

// --- Linescore ---

export interface MlbLinescore {
  innings: Array<{
    away?: { runs?: number }
    home?: { runs?: number }
  }>
}

export async function fetchLinescore(gamePk: number): Promise<MlbLinescore> {
  const url = `${MLB_BASE}/game/${gamePk}/linescore`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) return { innings: [] }
  return res.json()
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/mlb-api.ts
git commit -m "feat: add MLB Stats API helpers (schedule, pitcher stats, team OBP, linescore)"
```

---

## Task 7: Baseball Savant Integration (TDD)

**Files:**
- Create: `lib/savant-api.ts`
- Create: `__tests__/savant-api.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/savant-api.test.ts`:

```ts
import { parseSavantCsv, getSavantStats } from '@/lib/savant-api'
import { LEAGUE_AVG_BARREL_PCT, LEAGUE_AVG_HARD_HIT_PCT } from '@/lib/poisson'

const SAMPLE_CSV = `player_id,player_name,barrel_batted_rate,hard_hit_percent,p_formatted_ip
123456,Cole Pitcher,10.5,45.2,120.1
789012,Bad Pitcher,15.0,52.0,55.0
999999,Few IP Guy,6.0,35.0,20.0`

describe('parseSavantCsv', () => {
  it('parses player_id, barrelRate, hardHitRate, and IP', () => {
    const result = parseSavantCsv(SAMPLE_CSV)
    expect(result['123456']).toEqual({
      playerId: 123456,
      barrelRate: 10.5,
      hardHitRate: 45.2,
      inningsPitched: expect.closeTo(120.33, 1),
    })
  })

  it('includes pitchers with >= 50 IP after parsing', () => {
    const result = parseSavantCsv(SAMPLE_CSV)
    expect(result['789012']).toBeDefined()
  })

  it('excludes pitchers with < 50 IP', () => {
    const result = parseSavantCsv(SAMPLE_CSV)
    expect(result['999999']).toBeUndefined()
  })
})

describe('getSavantStats', () => {
  it('returns stats for a known pitcher ID', () => {
    const store = { '123456': { playerId: 123456, barrelRate: 10.5, hardHitRate: 45.2, inningsPitched: 120 } }
    const result = getSavantStats(123456, store)
    expect(result.barrelRate).toBe(10.5)
  })

  it('returns league avg barrel rate for unknown pitcher', () => {
    const result = getSavantStats(0, {})
    expect(result.barrelRate).toBe(LEAGUE_AVG_BARREL_PCT)
    expect(result.hardHitRate).toBe(LEAGUE_AVG_HARD_HIT_PCT)
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test -- --testPathPattern=savant
```

Expected: FAIL — `Cannot find module '@/lib/savant-api'`

- [ ] **Step 3: Create `lib/savant-api.ts`**

```ts
import Papa from 'papaparse'
import type { SavantStats } from './types'
import { kvGet, kvSet } from './kv'
import { LEAGUE_AVG_BARREL_PCT, LEAGUE_AVG_HARD_HIT_PCT } from './poisson'

const MIN_IP = 50
const KV_TTL_SECONDS = 12 * 60 * 60 // 12 hours

function savantKey(year: number): string {
  return `savant-pitchers:${year}`
}

function parseIP(formatted: string): number {
  const parts = formatted.split('.')
  return parseInt(parts[0], 10) + (parseInt(parts[1] ?? '0', 10)) / 3
}

export type SavantStore = Record<string, SavantStats>

export function parseSavantCsv(csv: string): SavantStore {
  const { data } = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })
  const store: SavantStore = {}

  for (const row of data) {
    const ip = parseIP(row['p_formatted_ip'] ?? '0')
    if (ip < MIN_IP) continue

    const playerId = parseInt(row['player_id'], 10)
    if (isNaN(playerId)) continue

    store[String(playerId)] = {
      playerId,
      barrelRate: parseFloat(row['barrel_batted_rate'] ?? '0'),
      hardHitRate: parseFloat(row['hard_hit_percent'] ?? '0'),
      inningsPitched: ip,
    }
  }

  return store
}

export function getSavantStats(
  playerId: number,
  store: SavantStore
): Pick<SavantStats, 'barrelRate' | 'hardHitRate'> {
  const entry = store[String(playerId)]
  if (!entry) {
    return { barrelRate: LEAGUE_AVG_BARREL_PCT, hardHitRate: LEAGUE_AVG_HARD_HIT_PCT }
  }
  return { barrelRate: entry.barrelRate, hardHitRate: entry.hardHitRate }
}

async function fetchSavantCsv(year: number): Promise<string> {
  const url = `https://baseballsavant.mlb.com/leaderboard/statcast?type=pitcher&year=${year}&position=SP,RP&team=&min=1&csv=true`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Savant fetch failed: ${res.status}`)
  return res.text()
}

export async function loadSavantStore(year: number): Promise<SavantStore> {
  const cached = await kvGet<SavantStore>(savantKey(year))
  if (cached) return cached

  const csv = await fetchSavantCsv(year)
  const store = parseSavantCsv(csv)
  await kvSet(savantKey(year), store, KV_TTL_SECONDS)
  return store
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npm test -- --testPathPattern=savant
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/savant-api.ts __tests__/savant-api.test.ts
git commit -m "feat: add Baseball Savant CSV integration with test coverage"
```

---

## Task 8: Weather API (TDD for wind factor logic)

**Files:**
- Create: `lib/weather-api.ts`
- Create: `__tests__/weather-api.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/weather-api.test.ts`:

```ts
import { getStadiumConstants, fetchWeather } from '@/lib/weather-api'

describe('getStadiumConstants', () => {
  it('returns Fenway Park constants for venueId 3', () => {
    const stadium = getStadiumConstants(3)
    expect(stadium).not.toBeNull()
    expect(stadium!.name).toContain('Fenway')
    expect(stadium!.outfieldFacingDegrees).toBeDefined()
  })

  it('returns null for unknown venueId', () => {
    expect(getStadiumConstants(99999)).toBeNull()
  })

  it('has all 30 stadiums defined', () => {
    const { STADIUMS } = require('@/lib/weather-api')
    expect(Object.keys(STADIUMS).length).toBe(30)
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test -- --testPathPattern=weather
```

Expected: FAIL — `Cannot find module '@/lib/weather-api'`

- [ ] **Step 3: Create `lib/weather-api.ts`**

```ts
import type { WeatherData } from './types'

export interface StadiumConstants {
  venueId: number
  name: string
  lat: number
  lon: number
  outfieldFacingDegrees: number
}

// All 30 MLB stadiums. outfieldFacingDegrees = compass bearing the outfield faces.
// Wind FROM that direction = blowing in. Wind FROM opposite (±180°) = blowing out.
export const STADIUMS: Record<number, StadiumConstants> = {
  2:    { venueId: 2,    name: 'Oriole Park at Camden Yards', lat: 39.2838,  lon: -76.6218,  outfieldFacingDegrees: 335 },
  3:    { venueId: 3,    name: 'Fenway Park',                 lat: 42.3467,  lon: -71.0972,  outfieldFacingDegrees: 95  },
  4:    { venueId: 4,    name: 'Guaranteed Rate Field',       lat: 41.8300,  lon: -87.6341,  outfieldFacingDegrees: 5   },
  5:    { venueId: 5,    name: 'Progressive Field',           lat: 41.4962,  lon: -81.6852,  outfieldFacingDegrees: 5   },
  7:    { venueId: 7,    name: 'Kauffman Stadium',            lat: 39.0517,  lon: -94.4803,  outfieldFacingDegrees: 330 },
  10:   { venueId: 10,   name: 'Oakland Coliseum',            lat: 37.7516,  lon: -122.2005, outfieldFacingDegrees: 330 },
  12:   { venueId: 12,   name: 'Tropicana Field',             lat: 27.7683,  lon: -82.6534,  outfieldFacingDegrees: 0   },
  14:   { venueId: 14,   name: 'Rogers Centre',               lat: 43.6414,  lon: -79.3894,  outfieldFacingDegrees: 0   },
  15:   { venueId: 15,   name: 'Chase Field',                 lat: 33.4455,  lon: -112.0667, outfieldFacingDegrees: 340 },
  17:   { venueId: 17,   name: 'Wrigley Field',               lat: 41.9484,  lon: -87.6553,  outfieldFacingDegrees: 353 },
  19:   { venueId: 19,   name: 'Coors Field',                 lat: 39.7559,  lon: -104.9942, outfieldFacingDegrees: 347 },
  22:   { venueId: 22,   name: 'Dodger Stadium',              lat: 34.0739,  lon: -118.2400, outfieldFacingDegrees: 305 },
  31:   { venueId: 31,   name: 'PNC Park',                    lat: 40.4468,  lon: -80.0057,  outfieldFacingDegrees: 15  },
  32:   { venueId: 32,   name: 'American Family Field',       lat: 43.0280,  lon: -87.9712,  outfieldFacingDegrees: 5   },
  680:  { venueId: 680,  name: 'T-Mobile Park',               lat: 47.5914,  lon: -122.3325, outfieldFacingDegrees: 0   },
  2392: { venueId: 2392, name: 'Minute Maid Park',            lat: 29.7573,  lon: -95.3555,  outfieldFacingDegrees: 350 },
  2394: { venueId: 2394, name: 'Comerica Park',               lat: 42.3390,  lon: -83.0485,  outfieldFacingDegrees: 350 },
  2395: { venueId: 2395, name: 'Oracle Park',                 lat: 37.7786,  lon: -122.3893, outfieldFacingDegrees: 35  },
  2602: { venueId: 2602, name: 'Great American Ball Park',    lat: 39.0979,  lon: -84.5082,  outfieldFacingDegrees: 20  },
  2680: { venueId: 2680, name: 'Petco Park',                  lat: 32.7073,  lon: -117.1566, outfieldFacingDegrees: 307 },
  2681: { venueId: 2681, name: 'Citizens Bank Park',          lat: 39.9061,  lon: -75.1665,  outfieldFacingDegrees: 350 },
  2889: { venueId: 2889, name: 'Busch Stadium',               lat: 38.6226,  lon: -90.1928,  outfieldFacingDegrees: 346 },
  3289: { venueId: 3289, name: 'Citi Field',                  lat: 40.7571,  lon: -73.8458,  outfieldFacingDegrees: 5   },
  3309: { venueId: 3309, name: 'Nationals Park',              lat: 38.8730,  lon: -77.0074,  outfieldFacingDegrees: 355 },
  3312: { venueId: 3312, name: 'Target Field',                lat: 44.9817,  lon: -93.2781,  outfieldFacingDegrees: 30  },
  3313: { venueId: 3313, name: 'Yankee Stadium',              lat: 40.8296,  lon: -73.9262,  outfieldFacingDegrees: 25  },
  4169: { venueId: 4169, name: 'loanDepot park',              lat: 25.7781,  lon: -80.2197,  outfieldFacingDegrees: 320 },
  4705: { venueId: 4705, name: 'Truist Park',                 lat: 33.8909,  lon: -84.4679,  outfieldFacingDegrees: 335 },
  5325: { venueId: 5325, name: 'Globe Life Field',            lat: 32.7473,  lon: -97.0845,  outfieldFacingDegrees: 0   },
  1:    { venueId: 1,    name: 'Angel Stadium',               lat: 33.8003,  lon: -117.8827, outfieldFacingDegrees: 280 },
  1: undefined as unknown as StadiumConstants, // placeholder — Angel Stadium venueId TBD; verify via MLB API
}

// Remove placeholder — the Angel Stadium venueId must be verified
// DELETE the above duplicate and replace with correct venueId after checking:
// GET https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2025-04-01&hydrate=venue

export function getStadiumConstants(venueId: number): StadiumConstants | null {
  return STADIUMS[venueId] ?? null
}

// Fetches hourly weather from Open-Meteo and picks the slot closest to gameTime
export async function fetchWeather(
  venueId: number,
  gameTimeIso: string
): Promise<WeatherData> {
  const stadium = getStadiumConstants(venueId)
  if (!stadium) {
    return { tempF: 72, windSpeedMph: 0, windFromDegrees: 0, failure: false }
  }

  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', String(stadium.lat))
    url.searchParams.set('longitude', String(stadium.lon))
    url.searchParams.set('hourly', 'temperature_2m,wind_speed_10m,wind_direction_10m')
    url.searchParams.set('temperature_unit', 'fahrenheit')
    url.searchParams.set('wind_speed_unit', 'mph')
    url.searchParams.set('forecast_days', '2')
    url.searchParams.set('timezone', 'auto')

    const res = await fetch(url.toString(), { next: { revalidate: 1800 } })
    if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`)

    const data = await res.json()
    const hours: string[] = data.hourly.time
    const temps: number[] = data.hourly.temperature_2m
    const speeds: number[] = data.hourly.wind_speed_10m
    const directions: number[] = data.hourly.wind_direction_10m

    const gameMs = new Date(gameTimeIso).getTime()
    let closestIdx = 0
    let minDiff = Infinity
    for (let i = 0; i < hours.length; i++) {
      const diff = Math.abs(new Date(hours[i]).getTime() - gameMs)
      if (diff < minDiff) { minDiff = diff; closestIdx = i }
    }

    return {
      tempF: Math.round(temps[closestIdx]),
      windSpeedMph: Math.round(speeds[closestIdx]),
      windFromDegrees: Math.round(directions[closestIdx]),
      failure: false,
    }
  } catch {
    return { tempF: 72, windSpeedMph: 0, windFromDegrees: 0, failure: true }
  }
}

export function getOutfieldFacingDegrees(venueId: number): number {
  return STADIUMS[venueId]?.outfieldFacingDegrees ?? 0
}
```

**Note:** The Angel Stadium venueId (for LAA) needs to be verified against the MLB Stats API. Check by fetching a recent Angels game schedule. Update the STADIUMS map accordingly before deploying.

- [ ] **Step 4: Fix the duplicate key in STADIUMS**

The template above has a placeholder duplicate key for Angel Stadium. In the actual implementation, remove the placeholder entry and insert the correct venueId after verifying it. The correct venueId for Angel Stadium can be found by running:

```bash
curl "https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2025-04-05&hydrate=venue" | grep -A2 "Angels"
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
npm test -- --testPathPattern=weather
```

Expected: All tests PASS.

- [ ] **Step 6: Run all tests**

```bash
npm test
```

Expected: All test suites PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/weather-api.ts __tests__/weather-api.test.ts
git commit -m "feat: add weather API with stadium constants and Open-Meteo integration"
```

---

## Task 9: API Route

**Files:**
- Create: `app/api/games/route.ts`

No unit tests — this is the orchestration layer. Verify manually with `npm run dev`.

- [ ] **Step 1: Create `app/api/games/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { kvGet, kvSet } from '@/lib/kv'
import { fetchSchedule } from '@/lib/mlb-api'
import { fetchPitcherFipAndKPct, fetchTeamOBP, fetchLinescore } from '@/lib/mlb-api'
import { loadSavantStore, getSavantStats } from '@/lib/savant-api'
import { fetchWeather, getOutfieldFacingDegrees } from '@/lib/weather-api'
import { getParkFactor } from '@/lib/park-factors'
import { getGameStatus, computeFirstInningResult } from '@/lib/game-status'
import {
  computeLambda,
  computeYrfiProbability,
  breakEvenOdds,
  LEAGUE_AVG_FIP,
  LEAGUE_AVG_K_PCT,
  LEAGUE_AVG_BARREL_PCT,
  LEAGUE_AVG_OBP,
  LEAGUE_AVG_HARD_HIT_PCT,
} from '@/lib/poisson'
import type { GameResult, GamesResponse, PitcherStats } from '@/lib/types'

const RESPONSE_TTL_SECONDS = 300 // 5 minutes

function getPacificDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date())
}

function currentSeason(): number {
  const pacificDate = getPacificDate()
  return parseInt(pacificDate.split('-')[0], 10)
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') ?? getPacificDate()

  // KV cache check
  const cacheKey = `games-response:${date}`
  const cached = await kvGet<GamesResponse>(cacheKey)
  if (cached) return NextResponse.json(cached)

  try {
    const season = currentSeason()
    const games = await fetchSchedule(date)

    if (games.length === 0) {
      const response: GamesResponse = { date, games: [], generatedAt: new Date().toISOString() }
      await kvSet(cacheKey, response, RESPONSE_TTL_SECONDS)
      return NextResponse.json(response)
    }

    // Load Savant store once for all pitchers
    const savantStore = await loadSavantStore(season)

    // Fetch weather for all venues in parallel
    const venueIds = [...new Set(games.map(g => g.venue.id))]
    const weatherByVenue = new Map<number, Awaited<ReturnType<typeof fetchWeather>>>()
    await Promise.all(
      venueIds.map(async venueId => {
        const game = games.find(g => g.venue.id === venueId)!
        const weather = await fetchWeather(venueId, game.gameDate)
        weatherByVenue.set(venueId, weather)
      })
    )

    // Fetch pitcher stats and team OBP in parallel (batch)
    const pitcherIds = [
      ...new Set(
        games.flatMap(g => [
          g.teams.home.probablePitcher?.id,
          g.teams.away.probablePitcher?.id,
        ].filter((id): id is number => id !== undefined)
      )
    ]
    const teamIds = [...new Set(games.flatMap(g => [g.teams.home.team.id, g.teams.away.team.id]))]

    const [pitcherStats, teamOBPs] = await Promise.all([
      Promise.all(pitcherIds.map(async id => ({ id, stats: await fetchPitcherFipAndKPct(id, season) }))),
      Promise.all(teamIds.map(async id => ({ id, obp: await fetchTeamOBP(id, season) }))),
    ])

    const pitcherStatsMap = new Map(pitcherStats.map(p => [p.id, p.stats]))
    const teamOBPMap = new Map(teamOBPs.map(t => [t.id, t.obp]))

    // Build results
    const results: GameResult[] = await Promise.all(
      games.map(async (game): Promise<GameResult> => {
        const gameStatus = getGameStatus(game.status.detailedState)
        const venueId = game.venue.id
        const weather = weatherByVenue.get(venueId) ?? { tempF: 72, windSpeedMph: 0, windFromDegrees: 0, failure: false }
        const parkFactor = getParkFactor(venueId)
        const outfieldFacing = getOutfieldFacingDegrees(venueId)

        function buildPitcherStats(
          pitcher: { id: number; fullName: string } | undefined,
          teamId: number
        ): PitcherStats {
          if (!pitcher) {
            return {
              playerId: 0, name: 'TBD',
              fip: LEAGUE_AVG_FIP, kPct: LEAGUE_AVG_K_PCT,
              barrelRate: LEAGUE_AVG_BARREL_PCT, hardHitRate: LEAGUE_AVG_HARD_HIT_PCT,
              confirmed: false,
            }
          }
          const stats = pitcherStatsMap.get(pitcher.id) ?? { fip: LEAGUE_AVG_FIP, kPct: LEAGUE_AVG_K_PCT }
          const savant = getSavantStats(pitcher.id, savantStore)
          return {
            playerId: pitcher.id, name: pitcher.fullName,
            fip: stats.fip, kPct: stats.kPct,
            barrelRate: savant.barrelRate, hardHitRate: savant.hardHitRate,
            confirmed: true,
          }
        }

        const homePitcher = buildPitcherStats(game.teams.home.probablePitcher, game.teams.home.team.id)
        const awayPitcher = buildPitcherStats(game.teams.away.probablePitcher, game.teams.away.team.id)
        const homeOBP = teamOBPMap.get(game.teams.home.team.id) ?? LEAGUE_AVG_OBP
        const awayOBP = teamOBPMap.get(game.teams.away.team.id) ?? LEAGUE_AVG_OBP

        const sharedEnv = {
          parkFactor,
          tempF: weather.failure ? 72 : weather.tempF,
          windSpeedMph: weather.failure ? 0 : weather.windSpeedMph,
          windFromDegrees: weather.failure ? 0 : weather.windFromDegrees,
          outfieldFacingDegrees: outfieldFacing,
        }

        // Home team bats against away pitcher
        const lambdaHome = computeLambda({
          pitcherFip: awayPitcher.fip,
          pitcherKPct: awayPitcher.kPct,
          pitcherBarrelRate: awayPitcher.barrelRate,
          teamOBP: homeOBP,
          ...sharedEnv,
        })

        // Away team bats against home pitcher
        const lambdaAway = computeLambda({
          pitcherFip: homePitcher.fip,
          pitcherKPct: homePitcher.kPct,
          pitcherBarrelRate: homePitcher.barrelRate,
          teamOBP: awayOBP,
          ...sharedEnv,
        })

        const yrfiProbability = computeYrfiProbability(lambdaHome, lambdaAway)
        const odds = breakEvenOdds(yrfiProbability)

        let firstInningResult: GameResult['firstInningResult'] = 'pending'
        if (gameStatus === 'inProgress' || gameStatus === 'settled') {
          const linescore = await fetchLinescore(game.gamePk)
          firstInningResult = computeFirstInningResult(linescore)
        }

        return {
          gamePk: game.gamePk,
          gameTime: game.gameDate,
          gameStatus,
          venue: game.venue.name,
          venueId,
          homePitcher,
          awayPitcher,
          homeTeam: game.teams.home.team.name,
          awayTeam: game.teams.away.team.name,
          homeTeamId: game.teams.home.team.id,
          awayTeamId: game.teams.away.team.id,
          homeOBP,
          awayOBP,
          lambda: { home: lambdaHome, away: lambdaAway },
          yrfiProbability,
          breakEvenOdds: odds,
          weather,
          firstInningResult,
        }
      })
    )

    // Sort by YRFI probability descending
    results.sort((a, b) => b.yrfiProbability - a.yrfiProbability)

    const response: GamesResponse = {
      date,
      games: results,
      generatedAt: new Date().toISOString(),
    }

    await kvSet(cacheKey, response, RESPONSE_TTL_SECONDS)
    return NextResponse.json(response)
  } catch (err) {
    console.error('[/api/games] error:', err)
    return NextResponse.json({ error: 'Failed to load games', status: 500 }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify manually**

```bash
npm run dev
```

Open `http://localhost:3000/api/games` in your browser. Expected: JSON response with a `games` array (may be empty if no games today). Check the browser network tab for errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/games/route.ts
git commit -m "feat: add /api/games route with Poisson model pipeline"
```

---

## Task 10: UI Components

**Files:**
- Create: `app/components/LoadingSkeleton.tsx`
- Create: `app/components/StatusBar.tsx`
- Create: `app/components/DatePicker.tsx`
- Create: `app/components/GameRow.tsx`
- Create: `app/components/GameTable.tsx`
- Create: `app/components/ClientShell.tsx`

No automated tests — verify visually with `npm run dev`.

- [ ] **Step 1: Create `app/globals.css`**

Replace default content with:

```css
@import "tailwindcss";

:root {
  --green: #16a34a;
  --green-light: #dcfce7;
  --green-dark: #15803d;
}

body {
  @apply bg-white text-slate-900 antialiased;
}
```

- [ ] **Step 2: Create `app/components/LoadingSkeleton.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'

export default function LoadingSkeleton() {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-4 text-sm text-slate-500">Loading games… {elapsed}s</div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `app/components/StatusBar.tsx`**

```tsx
'use client'

interface StatusBarProps {
  generatedAt: string
  gameCount: number
  onRefresh: () => void
  refreshing: boolean
}

export default function StatusBar({ generatedAt, gameCount, onRefresh, refreshing }: StatusBarProps) {
  const updated = new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 text-sm text-slate-500">
      <div className="flex items-center gap-3">
        <span>Updated {updated}</span>
        <span className="hidden sm:inline">·</span>
        <span className="hidden sm:inline">{gameCount} game{gameCount !== 1 ? 's' : ''}</span>
      </div>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-50"
      >
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Create `app/components/DatePicker.tsx`**

```tsx
'use client'

interface DatePickerProps {
  date: string        // YYYY-MM-DD
  onChange: (date: string) => void
}

function getPacificToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date())
}

export default function DatePicker({ date, onChange }: DatePickerProps) {
  const today = getPacificToday()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  return (
    <div className="flex gap-2 px-4 py-3">
      {[today, tomorrowStr].map(d => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            date === d
              ? 'bg-green-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {d === today ? 'Today' : 'Tomorrow'}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Create `app/components/GameRow.tsx`**

```tsx
import type { GameResult } from '@/lib/types'
import { formatOdds } from '@/lib/poisson'

interface GameRowProps {
  game: GameResult
}

function yrfiColor(pct: number): string {
  if (pct >= 0.55) return 'text-green-700 font-semibold'
  if (pct >= 0.45) return 'text-yellow-600 font-semibold'
  return 'text-red-600 font-semibold'
}

function formatPct(p: number, estimated: boolean): string {
  return `${estimated ? '~' : ''}${Math.round(p * 100)}%`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function weatherDisplay(weather: GameResult['weather']): string {
  if (weather.failure) return '—'
  const speed = weather.windSpeedMph
  const wind = speed < 5 ? 'calm' : `${speed}mph`
  return `${weather.tempF}°F ${wind}`
}

function ResultBadge({ result }: { result: GameResult['firstInningResult'] }) {
  if (result === 'run') return <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">RUN ✓</span>
  if (result === 'no_run') return <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">NO</span>
  return null
}

export default function GameRow({ game }: GameRowProps) {
  const estimated = !game.homePitcher.confirmed || !game.awayPitcher.confirmed
  const pct = formatPct(game.yrfiProbability, estimated)
  const odds = formatOdds(game.breakEvenOdds, estimated)

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50">
      {/* Matchup */}
      <td className="px-4 py-3 font-medium">
        <span className="text-slate-500">{game.awayTeam}</span>
        <span className="mx-1 text-slate-300">@</span>
        <span>{game.homeTeam}</span>
      </td>
      {/* Away SP */}
      <td className="px-4 py-3 text-sm text-slate-600">{game.awayPitcher.name}</td>
      {/* Home SP */}
      <td className="px-4 py-3 text-sm text-slate-600">{game.homePitcher.name}</td>
      {/* YRFI % */}
      <td className={`px-4 py-3 tabular-nums ${yrfiColor(game.yrfiProbability)}`}>{pct}</td>
      {/* Bet at */}
      <td className="px-4 py-3 text-sm font-medium text-slate-700 tabular-nums">{odds}</td>
      {/* Weather */}
      <td className="hidden px-4 py-3 text-sm text-slate-500 sm:table-cell">{weatherDisplay(game.weather)}</td>
      {/* Time + Result */}
      <td className="px-4 py-3 text-right text-sm text-slate-500">
        <div className="flex items-center justify-end gap-2">
          <ResultBadge result={game.firstInningResult} />
          <span>{formatTime(game.gameTime)}</span>
        </div>
      </td>
    </tr>
  )
}
```

- [ ] **Step 6: Create `app/components/GameTable.tsx`**

```tsx
import type { GameResult } from '@/lib/types'
import GameRow from './GameRow'
import { formatOdds } from '@/lib/poisson'

interface GameTableProps {
  games: GameResult[]
  label: string
}

function MobileCard({ game }: { game: GameResult }) {
  const estimated = !game.homePitcher.confirmed || !game.awayPitcher.confirmed
  const pct = `${estimated ? '~' : ''}${Math.round(game.yrfiProbability * 100)}%`
  const odds = formatOdds(game.breakEvenOdds, estimated)
  const time = new Date(game.gameTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  const yrfiColor = game.yrfiProbability >= 0.55
    ? 'text-green-700' : game.yrfiProbability >= 0.45
    ? 'text-yellow-600' : 'text-red-600'

  return (
    <div className="border-b border-slate-100 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="font-medium">
          <span className="text-slate-500">{game.awayTeam}</span>
          <span className="mx-1 text-slate-300">@</span>
          <span>{game.homeTeam}</span>
        </div>
        <div className={`text-lg font-bold tabular-nums ${yrfiColor}`}>{pct}</div>
      </div>
      <div className="mt-1 flex items-center justify-between text-sm text-slate-500">
        <span>{game.awayPitcher.name} vs {game.homePitcher.name}</span>
        <span className="font-medium text-slate-700">{odds}</span>
      </div>
      <div className="mt-0.5 text-xs text-slate-400">{time}</div>
    </div>
  )
}

export default function GameTable({ games, label }: GameTableProps) {
  if (games.length === 0) return null

  return (
    <section className="mb-8">
      <h2 className="mb-2 px-4 text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</h2>

      {/* Mobile card list */}
      <div className="sm:hidden rounded-xl border border-slate-200 bg-white overflow-hidden">
        {games.map(g => <MobileCard key={g.gamePk} game={g} />)}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-3">Matchup</th>
              <th className="px-4 py-3">Away SP</th>
              <th className="px-4 py-3">Home SP</th>
              <th className="px-4 py-3">YRFI %</th>
              <th className="px-4 py-3">Bet at</th>
              <th className="px-4 py-3">Weather</th>
              <th className="px-4 py-3 text-right">Time</th>
            </tr>
          </thead>
          <tbody>
            {games.map(g => <GameRow key={g.gamePk} game={g} />)}
          </tbody>
        </table>
      </div>
    </section>
  )
}
```

- [ ] **Step 7: Create `app/components/ClientShell.tsx`**

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { GamesResponse } from '@/lib/types'
import GameTable from './GameTable'
import StatusBar from './StatusBar'
import DatePicker from './DatePicker'
import LoadingSkeleton from './LoadingSkeleton'

function getPacificToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date())
}

export default function ClientShell() {
  const [date, setDate] = useState(getPacificToday)
  const [data, setData] = useState<GamesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, setTick] = useState(0) // for 60s re-render timer

  const fetchData = useCallback(async (d: string, silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setError(null)
    try {
      const res = await fetch(`/api/games?date=${d}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Failed to load')
      }
      const json: GamesResponse = await res.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Fetch on mount and date change
  useEffect(() => {
    fetchData(date)
  }, [date, fetchData])

  // Re-fetch timer: every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => fetchData(date, true), 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [date, fetchData])

  // Re-render timer: every 60 seconds (UI clock update only)
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  const upcoming = data?.games.filter(g => g.gameStatus === 'upcoming') ?? []
  const inProgress = data?.games.filter(g => g.gameStatus === 'inProgress') ?? []
  const settled = data?.games.filter(g => g.gameStatus === 'settled') ?? []

  return (
    <div className="mx-auto max-w-5xl">
      <DatePicker date={date} onChange={d => { setDate(d); setData(null) }} />

      {data && (
        <StatusBar
          generatedAt={data.generatedAt}
          gameCount={data.games.length}
          onRefresh={() => fetchData(date, true)}
          refreshing={refreshing}
        />
      )}

      {loading && <LoadingSkeleton />}

      {error && (
        <div className="mx-4 mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">Failed to load games</p>
          <p className="mt-1 text-red-600">{error}</p>
          <button
            onClick={() => fetchData(date)}
            className="mt-3 rounded bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <div className="px-4 py-6">
          {data.games.length === 0 && (
            <p className="text-center text-slate-400">No games scheduled for this date.</p>
          )}
          <GameTable games={upcoming} label="Upcoming" />
          <GameTable games={inProgress} label="In Progress" />
          <GameTable games={settled} label="Settled" />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 8: Commit**

```bash
git add app/components/ app/globals.css
git commit -m "feat: add all UI components (table, cards, date picker, status bar)"
```

---

## Task 11: Root Page and Layout

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update `app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { SITE_NAME, getSiteUrl } from '@/lib/site'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: `${SITE_NAME} — MLB YRFI Betting Model`,
  description: 'Find the minimum odds you need to bet YRFI with a statistical edge. Model-driven, updated daily.',
  openGraph: {
    title: `${SITE_NAME} — MLB YRFI Betting Model`,
    description: 'Find the minimum odds you need to bet YRFI with a statistical edge. Model-driven, updated daily.',
    url: getSiteUrl(),
    siteName: SITE_NAME,
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={geist.className}>
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Update `app/page.tsx`**

```tsx
import ClientShell from './components/ClientShell'
import { SITE_NAME } from '@/lib/site'

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="mx-auto max-w-5xl flex items-baseline gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-green-600">{SITE_NAME}</h1>
          <span className="hidden text-sm text-slate-400 sm:block">MLB YRFI Betting Model</span>
        </div>
      </header>
      <ClientShell />
    </main>
  )
}
```

- [ ] **Step 3: Run full build to confirm no TypeScript errors**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Smoke test in dev**

```bash
npm run dev
```

Open `http://localhost:3000`. Verify: header renders, date picker shows Today/Tomorrow, table loads with game data (or "No games scheduled" if off-season).

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: All test suites PASS.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/layout.tsx
git commit -m "feat: add root page and layout with OG metadata"
```

---

## Task 12: GitHub Repo and Vercel Deployment

- [ ] **Step 1: Create GitHub repository**

```bash
gh repo create yrfi --public --source=. --remote=origin --push
```

If `gh` is not authenticated, run `gh auth login` first.

- [ ] **Step 2: Verify push succeeded**

```bash
git log --oneline origin/master
```

Expected: All commits are on the remote.

- [ ] **Step 3: Create Vercel project and link**

```bash
npx vercel
```

When prompted:
- Link to existing project? **No**
- Project name: `yrfi`
- Root directory: `.` (current)
- Override settings? **No**

This creates a preview deployment. Copy the preview URL and verify the site loads.

- [ ] **Step 4: Add environment variables in Vercel dashboard**

Go to the Vercel dashboard → yrfi project → Settings → Environment Variables. Add:

| Variable | Value | Environment |
|---|---|---|
| `KV_REST_API_URL` | (from Vercel KV store) | Production, Preview |
| `KV_REST_API_TOKEN` | (from Vercel KV store) | Production, Preview |
| `NEXT_PUBLIC_SITE_URL` | `https://yrfi.vercel.app` (or custom domain) | Production |

To create a KV store: Vercel dashboard → Storage → Create Database → KV → link to yrfi project.

- [ ] **Step 5: Deploy to production**

```bash
npx vercel --prod
```

Expected: Deployment URL printed. Open it and verify games load.

- [ ] **Step 6: Final smoke test on production**

- Open the production URL
- Verify the table loads with today's games
- Verify YRFI % and "Bet at" columns are populated
- Verify weather column shows temperature and wind (or `—` for domes)
- Switch to Tomorrow and verify data loads

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "chore: production deployment verified"
git push
```

---

## Running All Tests

```bash
npm test
```

Covers: `poisson`, `game-status`, `savant-api`, `weather-api`

## Post-Launch Notes

- **Park factors:** Update `lib/park-factors.ts` after the first 2–3 weeks of the season when FanGraphs has enough data.
- **League averages:** Update constants in `lib/poisson.ts` each April using the prior season's final averages.
- **Angel Stadium venueId:** Verify via MLB Stats API before launch — the placeholder in `weather-api.ts` must be corrected.
- **Savant CSV columns:** If the Baseball Savant leaderboard CSV format changes mid-season, update `parseSavantCsv()` column names accordingly.
