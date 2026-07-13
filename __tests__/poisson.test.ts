import {
  BASE_LAMBDA,
  dateAdjustedStabilizationSample,
  computeLambda,
  computeYrfiProbability,
  computeNrfiProbability,
  breakEvenOdds,
  formatOdds,
  stabilizationMultiplierForDate,
  shrinkTowardAverage,
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

  it('returns calibrated base lambda for all-average inputs', () => {
    const result = computeLambda(avgInputs)
    expect(result).toBeCloseTo(BASE_LAMBDA, 2)
  })

  it('produces higher lambda for a bad pitcher (FIP 5.5)', () => {
    const result = computeLambda({ ...avgInputs, pitcherFip: 5.5 })
    expect(result).toBeGreaterThan(BASE_LAMBDA)
  })

  it('produces lower lambda for an elite pitcher (FIP 2.5)', () => {
    const result = computeLambda({ ...avgInputs, pitcherFip: 2.5 })
    expect(result).toBeLessThan(BASE_LAMBDA)
  })

  it('produces higher lambda for high barrel rate (12%)', () => {
    const result = computeLambda({ ...avgInputs, pitcherBarrelRate: 12 })
    expect(result).toBeGreaterThan(BASE_LAMBDA)
  })

  it('produces lower lambda for low barrel rate (4%)', () => {
    const result = computeLambda({ ...avgInputs, pitcherBarrelRate: 4 })
    expect(result).toBeLessThan(BASE_LAMBDA)
  })

  it('produces higher lambda for Coors Field (park factor 1.30)', () => {
    const result = computeLambda({ ...avgInputs, parkFactor: 1.30 })
    expect(result).toBeGreaterThan(BASE_LAMBDA)
    expect(result).toBeLessThan(0.45)
  })

  it('boosts lambda when the confirmed top of the order is stronger than the team baseline', () => {
    const result = computeLambda({ ...avgInputs, topOfOrderOBP: 0.360 })
    expect(result).toBeGreaterThan(BASE_LAMBDA)
  })

  it('reduces lambda when the confirmed top of the order is weaker than the team baseline', () => {
    const result = computeLambda({ ...avgInputs, topOfOrderOBP: 0.285 })
    expect(result).toBeLessThan(BASE_LAMBDA)
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

describe('shrinkTowardAverage', () => {
  it('returns the average when sample size is zero', () => {
    expect(shrinkTowardAverage(0.400, 0.310, 0, 600)).toBeCloseTo(0.310, 5)
  })

  it('moves noisy values toward the league average', () => {
    const shrunk = shrinkTowardAverage(0.400, 0.310, 50, 600)
    expect(shrunk).toBeGreaterThan(0.310)
    expect(shrunk).toBeLessThan(0.400)
  })
})

describe('dateAdjustedStabilizationSample', () => {
  it('increases stabilization pressure in April', () => {
    expect(stabilizationMultiplierForDate('2026-04-10')).toBeGreaterThan(1)
    expect(dateAdjustedStabilizationSample(100, '2026-04-10')).toBeGreaterThan(100)
  })

  it('returns the base sample once the season is established', () => {
    expect(stabilizationMultiplierForDate('2026-07-15')).toBe(1)
    expect(dateAdjustedStabilizationSample(100, '2026-07-15')).toBe(100)
  })

  it('falls back safely for invalid dates', () => {
    expect(stabilizationMultiplierForDate('not-a-date')).toBe(1)
  })
})

describe('computeYrfiProbability', () => {
  it('returns correct YRFI probability from two lambdas', () => {
    // P(YRFI) = 1 - e^(-BASE_LAMBDA) * e^(-BASE_LAMBDA) = 1 - e^(-0.6742) ≈ 0.4905
    const result = computeYrfiProbability(BASE_LAMBDA, BASE_LAMBDA)
    expect(result).toBeCloseTo(0.4905, 3)
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

describe('computeNrfiProbability', () => {
  it('returns correct NRFI probability from two lambdas', () => {
    // P(NRFI) = e^(-BASE_LAMBDA) * e^(-BASE_LAMBDA) = e^(-0.6742) ≈ 0.5095
    const result = computeNrfiProbability(BASE_LAMBDA, BASE_LAMBDA)
    expect(result).toBeCloseTo(0.5095, 3)
  })

  it('is the exact complement of computeYrfiProbability', () => {
    for (const [lh, la] of [[0.2, 0.3], [BASE_LAMBDA, BASE_LAMBDA], [0.9, 1.4]]) {
      expect(computeNrfiProbability(lh, la) + computeYrfiProbability(lh, la)).toBeCloseTo(1, 10)
    }
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
