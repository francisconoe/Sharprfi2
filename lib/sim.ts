// Monte Carlo first-inning simulation engine — adapted from Francisco
// Nevarez's NRFI/YRFI model (MLB11.py), with fixes agreed in July 2026:
// the opposing pitcher now affects reach-base probability (his code computed
// pitcher OBP-allowed but never used it), the full 9-batter order is simulated
// instead of truncating after 4 hitters, and walks advance runners only when
// forced instead of being drawn from the hit-type table.

export const SIM_LEAGUE_AVG_WOBA = 0.310
export const SIM_LEAGUE_AVG_OBP = 0.313

// FanGraphs linear weights, as used in MLB11.py (denominator: PA)
export const WOBA_WEIGHTS = {
  BB: 0.69,
  HBP: 0.72,
  '1B': 0.88,
  '2B': 1.25,
  '3B': 1.60,
  HR: 2.00,
} as const

// Hit-type split once a batter reaches via a hit (MLB average, per MLB11.py)
const PROB_SINGLE = 0.65
const PROB_DOUBLE = 0.20
const PROB_TRIPLE = 0.03
// HR = remaining 0.12

const PLATOON_SAME = -0.015
const PLATOON_DIFFERENT = 0.020

const MIN_REACH = 0.05
const MAX_REACH = 0.95

// Global reach-probability calibration. Station-to-station advancement (a
// single never scores a runner from 2nd, no steals/errors/wild pitches)
// structurally undercounts first-inning scoring, so wOBA-as-reach-probability
// alone yields ~40% league YRFI vs the observed 49.05% (2023–2025 backtest).
// This constant is binary-searched so league-average inputs reproduce 49.05%
// — the same neutral-baseline recalibration the Poisson model went through.
export const SIM_REACH_CALIBRATION = 1.2333

export const DEFAULT_SIM_ITERATIONS = 10_000

export type Hand = 'L' | 'R' | 'S'

export interface SimBatter {
  // Season counting stats; wOBA is computed and shrunk internally
  singles: number
  doubles: number
  triples: number
  homeRuns: number
  walks: number
  hitByPitch: number
  plateAppearances: number
  batSide: Hand | null
}

export interface SimPitcher {
  obpAllowed: number | null // OBP against; null → league average
  battersFaced: number
  pitchHand: Hand | null
}

export interface HalfInningSim {
  pScore: number
  expectedRuns: number
  expectedHits: number
}

export interface GameSim {
  simYrfiProbability: number
  home: HalfInningSim
  away: HalfInningSim
}

// Deterministic PRNG so cached responses and tests are stable (seed = gamePk)
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Francisco's volume weights: full trust at 30 PA (batters) / 10 TBF (pitchers),
// floor 0.15 when volume is missing or zero.
export function batterTrustWeight(pa: number): number {
  if (!Number.isFinite(pa) || pa <= 0) return 0.15
  return Math.min(pa / 30, 1.0)
}

export function pitcherTrustWeight(tbf: number): number {
  if (!Number.isFinite(tbf) || tbf <= 0) return 0.15
  return Math.min(tbf * 0.10, 1.0)
}

export function shrinkToLeague(value: number, weight: number, leagueAvg: number): number {
  return value * weight + leagueAvg * (1 - weight)
}

export function computeWoba(b: SimBatter): number {
  if (!Number.isFinite(b.plateAppearances) || b.plateAppearances <= 0) {
    return SIM_LEAGUE_AVG_WOBA
  }
  const numerator =
    b.singles * WOBA_WEIGHTS['1B'] +
    b.doubles * WOBA_WEIGHTS['2B'] +
    b.triples * WOBA_WEIGHTS['3B'] +
    b.homeRuns * WOBA_WEIGHTS.HR +
    b.walks * WOBA_WEIGHTS.BB +
    b.hitByPitch * WOBA_WEIGHTS.HBP
  return Math.min(Math.max(numerator / b.plateAppearances, 0), 1)
}

export function applyPlatoon(woba: number, batSide: Hand | null, pitchHand: Hand | null): number {
  if (!batSide || !pitchHand || batSide === 'S' || pitchHand === 'S') return woba
  return woba + (batSide === pitchHand ? PLATOON_SAME : PLATOON_DIFFERENT)
}

export function leagueAverageBatter(): SimBatter {
  // Produces exactly league-average wOBA after shrinkage (zero PA → full shrink)
  return {
    singles: 0, doubles: 0, triples: 0, homeRuns: 0,
    walks: 0, hitByPitch: 0, plateAppearances: 0, batSide: null,
  }
}

interface PreparedBatter {
  pReach: number
  pWalkGivenReach: number
}

function prepareBatters(
  batters: SimBatter[],
  pitcher: SimPitcher,
  parkFactor: number,
  streakFactor: number,
): PreparedBatter[] {
  const pitcherObp = shrinkToLeague(
    pitcher.obpAllowed ?? SIM_LEAGUE_AVG_OBP,
    pitcherTrustWeight(pitcher.battersFaced),
    SIM_LEAGUE_AVG_OBP,
  )
  const pitcherMultiplier = pitcherObp / SIM_LEAGUE_AVG_OBP
  // Runs park factors (FanGraphs, 1.00-neutral) are wider than Francisco's
  // wOBA-scale table; √PF matches his values (√1.28 ≈ his Coors 1.13) and the
  // Poisson model's 0.50 park exponent.
  const parkMultiplier = Math.sqrt(parkFactor)

  const roster = batters.length > 0 ? batters : [leagueAverageBatter()]
  return roster.map(b => {
    const raw = computeWoba(b)
    const shrunk = shrinkToLeague(raw, batterTrustWeight(b.plateAppearances), SIM_LEAGUE_AVG_WOBA)
    const withPlatoon = applyPlatoon(shrunk, b.batSide, pitcher.pitchHand)
    const pReach = Math.min(
      Math.max(withPlatoon * SIM_REACH_CALIBRATION * pitcherMultiplier * parkMultiplier * streakFactor, MIN_REACH),
      MAX_REACH,
    )
    const walks = b.walks + b.hitByPitch
    const hits = b.singles + b.doubles + b.triples + b.homeRuns
    const onBaseEvents = walks + hits
    // League-average walk share (~30% of on-base events) when no data
    const pWalkGivenReach = onBaseEvents > 0 ? walks / onBaseEvents : 0.30
    return { pReach, pWalkGivenReach }
  })
}

export function simulateHalfInning(
  batters: SimBatter[],
  pitcher: SimPitcher,
  parkFactor: number,
  streakFactor: number,
  rng: () => number,
  iterations: number = DEFAULT_SIM_ITERATIONS,
): HalfInningSim {
  const prepared = prepareBatters(batters, pitcher, parkFactor, streakFactor)
  let scoringInnings = 0
  let totalRuns = 0
  let totalHits = 0

  for (let sim = 0; sim < iterations; sim++) {
    let outs = 0
    let runs = 0
    let hits = 0
    let first = false
    let second = false
    let third = false
    let batterIndex = 0

    while (outs < 3) {
      const batter = prepared[batterIndex % prepared.length]
      batterIndex++

      if (rng() >= batter.pReach) {
        outs++
        continue
      }

      if (rng() < batter.pWalkGivenReach) {
        // Walk/HBP: runners advance only when forced
        if (first && second && third) runs++
        else if (first && second) third = true
        else if (first) second = true
        first = true
        continue
      }

      hits++
      const roll = rng()
      if (roll < PROB_SINGLE) {
        if (third) { runs++; third = false }
        if (second) { third = true; second = false }
        if (first) { second = true; first = false }
        first = true
      } else if (roll < PROB_SINGLE + PROB_DOUBLE) {
        if (third) { runs++; third = false }
        if (second) { runs++; second = false }
        if (first) { third = true; first = false }
        second = true
      } else if (roll < PROB_SINGLE + PROB_DOUBLE + PROB_TRIPLE) {
        if (third) { runs++; third = false }
        if (second) { runs++; second = false }
        if (first) { runs++; first = false }
        third = true
      } else {
        // Home run
        if (third) { runs++; third = false }
        if (second) { runs++; second = false }
        if (first) { runs++; first = false }
        runs++
      }
    }

    if (runs > 0) scoringInnings++
    totalRuns += runs
    totalHits += hits
  }

  return {
    pScore: scoringInnings / iterations,
    expectedRuns: totalRuns / iterations,
    expectedHits: totalHits / iterations,
  }
}

export interface SimGameInputs {
  gamePk: number
  parkFactor: number
  // Away bats top 1st vs home pitcher; home bats bottom 1st vs away pitcher
  awayBatters: SimBatter[]
  homeBatters: SimBatter[]
  awayPitcher: SimPitcher
  homePitcher: SimPitcher
  awayStreakFactor?: number
  homeStreakFactor?: number
  iterations?: number
}

export function simulateGame(inputs: SimGameInputs): GameSim {
  const rng = mulberry32(inputs.gamePk)
  const iterations = inputs.iterations ?? DEFAULT_SIM_ITERATIONS

  const away = simulateHalfInning(
    inputs.awayBatters,
    inputs.homePitcher,
    inputs.parkFactor,
    inputs.awayStreakFactor ?? 1.0,
    rng,
    iterations,
  )
  const home = simulateHalfInning(
    inputs.homeBatters,
    inputs.awayPitcher,
    inputs.parkFactor,
    inputs.homeStreakFactor ?? 1.0,
    rng,
    iterations,
  )

  return {
    simYrfiProbability: 1 - (1 - away.pScore) * (1 - home.pScore),
    home,
    away,
  }
}

// Francisco's streak factors (team win streak length → multiplier). Applied
// only when the backtest shows they help; sim callers pass 1.0 otherwise.
export const STREAK_FACTORS: Record<number, number> = {
  0: 1.00, 1: 1.05, 2: 1.10, 3: 1.15, 4: 1.20, 5: 1.25,
}

export function streakFactorForWinStreak(winStreak: number): number {
  const capped = Math.max(0, Math.min(5, Math.floor(winStreak)))
  return STREAK_FACTORS[capped] ?? 1.0
}

// Betting EV layer (calcular_ev in MLB11.py): profit per unit from American
// odds, EV per 1-unit stake given the model's probability.
export function impliedProbability(americanOdds: number): number {
  if (americanOdds < 0) return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100)
  return 100 / (americanOdds + 100)
}

export function expectedValuePerUnit(probability: number, americanOdds: number): number {
  const profitPerUnit = americanOdds < 0 ? 100 / Math.abs(americanOdds) : americanOdds / 100
  return probability * profitPerUnit - (1 - probability)
}
