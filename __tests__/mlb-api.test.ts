import { extractTopOfOrderStats } from '@/lib/mlb-api'

describe('extractTopOfOrderStats', () => {
  it('returns a confirmed top-of-order OBP when three lineup hitters are present', () => {
    const result = extractTopOfOrderStats({
      one: { battingOrder: '100', seasonStats: { batting: { obp: '.390', plateAppearances: 40 } } },
      two: { battingOrder: '200', seasonStats: { batting: { obp: '.360', plateAppearances: 55 } } },
      three: { battingOrder: '300', seasonStats: { batting: { obp: '.330', plateAppearances: 60 } } },
      bench: { seasonStats: { batting: { obp: '.410', plateAppearances: 10 } } },
    }, '2026-04-10')

    expect(result.confirmed).toBe(true)
    expect(result.batterCount).toBe(3)
    expect(result.topOfOrderOBP).not.toBeNull()
    expect(result.topOfOrderOBP!).toBeGreaterThan(0.31)
    expect(result.topOfOrderOBP!).toBeLessThan(0.39)
  })

  it('falls back cleanly when fewer than three lineup hitters are available', () => {
    const result = extractTopOfOrderStats({
      one: { battingOrder: '100', seasonStats: { batting: { obp: '.390', plateAppearances: 40 } } },
      two: { battingOrder: '200', seasonStats: { batting: { obp: '.360', plateAppearances: 55 } } },
    }, '2026-04-10')

    expect(result.confirmed).toBe(false)
    expect(result.topOfOrderOBP).toBeNull()
  })
})