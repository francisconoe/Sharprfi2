import {
  mulberry32,
  computeWoba,
  batterTrustWeight,
  pitcherTrustWeight,
  shrinkToLeague,
  applyPlatoon,
  simulateHalfInning,
  simulateGame,
  leagueAverageBatter,
  streakFactorForWinStreak,
  impliedProbability,
  expectedValuePerUnit,
  SIM_LEAGUE_AVG_WOBA,
  type SimBatter,
  type SimPitcher,
} from '@/lib/sim'

const leaguePitcher: SimPitcher = { obpAllowed: null, battersFaced: 0, pitchHand: null }

function batter(overrides: Partial<SimBatter> = {}): SimBatter {
  // ~league-average hitter: 600 PA season line
  return {
    singles: 95,
    doubles: 28,
    triples: 2,
    homeRuns: 18,
    walks: 50,
    hitByPitch: 5,
    plateAppearances: 600,
    batSide: null,
    ...overrides,
  }
}

describe('mulberry32', () => {
  it('is deterministic for the same seed', () => {
    const a = mulberry32(745123)
    const b = mulberry32(745123)
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b())
    }
  })

  it('produces values in [0, 1)', () => {
    const rng = mulberry32(1)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('computeWoba', () => {
  it('matches a hand-computed value with FanGraphs weights', () => {
    // (95×.88 + 28×1.25 + 2×1.60 + 18×2.00 + 50×.69 + 5×.72) / 600
    const expected = (95 * 0.88 + 28 * 1.25 + 2 * 1.6 + 18 * 2.0 + 50 * 0.69 + 5 * 0.72) / 600
    expect(computeWoba(batter())).toBeCloseTo(expected, 10)
  })

  it('returns league average for zero PA', () => {
    expect(computeWoba(batter({ plateAppearances: 0 }))).toBe(SIM_LEAGUE_AVG_WOBA)
  })
})

describe('trust weights (Francisco\'s shrinkage table)', () => {
  it('batter weight is PA/30 capped at 1.0, floor 0.15 when missing', () => {
    expect(batterTrustWeight(15)).toBeCloseTo(0.5, 10)
    expect(batterTrustWeight(30)).toBe(1.0)
    expect(batterTrustWeight(600)).toBe(1.0)
    expect(batterTrustWeight(0)).toBe(0.15)
    expect(batterTrustWeight(NaN)).toBe(0.15)
  })

  it('pitcher weight is TBF×0.10 capped at 1.0, floor 0.15 when missing', () => {
    expect(pitcherTrustWeight(5)).toBeCloseTo(0.5, 10)
    expect(pitcherTrustWeight(10)).toBe(1.0)
    expect(pitcherTrustWeight(0)).toBe(0.15)
  })

  it('shrinkToLeague interpolates linearly', () => {
    expect(shrinkToLeague(0.4, 0.5, 0.3)).toBeCloseTo(0.35, 10)
    expect(shrinkToLeague(0.4, 1.0, 0.3)).toBeCloseTo(0.4, 10)
    expect(shrinkToLeague(0.4, 0.0, 0.3)).toBeCloseTo(0.3, 10)
  })
})

describe('applyPlatoon', () => {
  it('penalizes same-handed matchups and boosts opposite-handed ones', () => {
    expect(applyPlatoon(0.31, 'R', 'R')).toBeCloseTo(0.295, 10)
    expect(applyPlatoon(0.31, 'L', 'R')).toBeCloseTo(0.33, 10)
  })

  it('is neutral for switch hitters or unknown hands', () => {
    expect(applyPlatoon(0.31, 'S', 'R')).toBe(0.31)
    expect(applyPlatoon(0.31, null, 'R')).toBe(0.31)
    expect(applyPlatoon(0.31, 'R', null)).toBe(0.31)
  })
})

describe('simulateHalfInning', () => {
  it('league-average everything lands near the calibrated half-inning rate (~28.6%)', () => {
    const rng = mulberry32(42)
    const result = simulateHalfInning(
      Array.from({ length: 9 }, () => leagueAverageBatter()),
      leaguePitcher, 1.0, 1.0, rng, 50_000,
    )
    expect(result.pScore).toBeGreaterThan(0.27)
    expect(result.pScore).toBeLessThan(0.30)
  })

  it('scores more against a worse pitcher', () => {
    const lineup = Array.from({ length: 9 }, () => batter())
    const good = simulateHalfInning(lineup, { obpAllowed: 0.270, battersFaced: 500, pitchHand: 'R' }, 1.0, 1.0, mulberry32(7), 20_000)
    const bad = simulateHalfInning(lineup, { obpAllowed: 0.380, battersFaced: 500, pitchHand: 'R' }, 1.0, 1.0, mulberry32(7), 20_000)
    expect(bad.pScore).toBeGreaterThan(good.pScore)
  })

  it('scores more with a better lineup', () => {
    const weak = Array.from({ length: 9 }, () => batter({ singles: 70, homeRuns: 8, walks: 30 }))
    const strong = Array.from({ length: 9 }, () => batter({ singles: 110, homeRuns: 35, walks: 70 }))
    const weakResult = simulateHalfInning(weak, leaguePitcher, 1.0, 1.0, mulberry32(7), 20_000)
    const strongResult = simulateHalfInning(strong, leaguePitcher, 1.0, 1.0, mulberry32(7), 20_000)
    expect(strongResult.pScore).toBeGreaterThan(weakResult.pScore)
  })

  it('a hitters park raises scoring', () => {
    const lineup = Array.from({ length: 9 }, () => batter())
    const neutral = simulateHalfInning(lineup, leaguePitcher, 1.0, 1.0, mulberry32(7), 20_000)
    const coors = simulateHalfInning(lineup, leaguePitcher, 1.28, 1.0, mulberry32(7), 20_000)
    expect(coors.pScore).toBeGreaterThan(neutral.pScore)
  })
})

describe('simulateGame', () => {
  const inputs = {
    gamePk: 745123,
    parkFactor: 1.0,
    awayBatters: Array.from({ length: 9 }, () => batter()),
    homeBatters: Array.from({ length: 9 }, () => batter()),
    awayPitcher: leaguePitcher,
    homePitcher: leaguePitcher,
    iterations: 10_000,
  }

  it('is deterministic for the same gamePk', () => {
    expect(simulateGame(inputs).simYrfiProbability).toBe(simulateGame(inputs).simYrfiProbability)
  })

  it('combines half-innings as 1 − (1−pH)(1−pA)', () => {
    const result = simulateGame(inputs)
    expect(result.simYrfiProbability).toBeCloseTo(
      1 - (1 - result.home.pScore) * (1 - result.away.pScore),
      10,
    )
  })
})

describe('streakFactorForWinStreak', () => {
  it('maps streak lengths to Francisco\'s multipliers, capped at 5', () => {
    expect(streakFactorForWinStreak(0)).toBe(1.0)
    expect(streakFactorForWinStreak(3)).toBe(1.15)
    expect(streakFactorForWinStreak(5)).toBe(1.25)
    expect(streakFactorForWinStreak(9)).toBe(1.25)
  })
})

describe('betting EV layer', () => {
  it('converts American odds to implied probability', () => {
    expect(impliedProbability(-120)).toBeCloseTo(120 / 220, 10)
    expect(impliedProbability(150)).toBeCloseTo(100 / 250, 10)
    expect(impliedProbability(100)).toBeCloseTo(0.5, 10)
  })

  it('computes EV per unit (Francisco\'s formula)', () => {
    // p=0.55 at +110: 0.55×1.1 − 0.45 = 0.155
    expect(expectedValuePerUnit(0.55, 110)).toBeCloseTo(0.155, 10)
    // p=0.5 at -110: 0.5×(100/110) − 0.5 ≈ −0.04545
    expect(expectedValuePerUnit(0.5, -110)).toBeCloseTo(0.5 * (100 / 110) - 0.5, 10)
    // fair odds → EV 0
    expect(expectedValuePerUnit(0.5, 100)).toBeCloseTo(0, 10)
  })
})
