import { computeMatchupBreakdown } from '@/lib/model-breakdown'

function makeGame(barrelRate: number, homeOBP = 0.31) {
  return {
    venueId: 1,
    parkFactor: 1,
    weather: {
      controlled: false,
      failure: false,
      tempF: 72,
      windSpeedMph: 0,
      windFromDegrees: 0,
    },
    topOfOrderOBP: { home: null, away: null },
    homeOBP,
    awayOBP: 0.31,
    lambda: { home: 0.3371, away: 0.3371 },
    homePitcher: { fip: 3.8, kPct: 0.23, barrelRate: 8, hardHitRate: 38 },
    awayPitcher: { fip: 3.8, kPct: 0.23, barrelRate, hardHitRate: 38 },
  } as never
}

describe('model-breakdown badge copy', () => {
  it('keeps neutral barrel copy for neutral multipliers', () => {
    const breakdown = computeMatchupBreakdown(makeGame(8))
    const barrel = breakdown.homeBats.pitcherFactors.find(factor => factor.label === 'Barrel%')

    expect(barrel).toMatchObject({
      direction: 'neutral',
      description: 'average barrel rate',
    })
  })

  it('uses distinct barrel copy for down and up multipliers', () => {
    const downBreakdown = computeMatchupBreakdown(makeGame(7.4))
    const upBreakdown = computeMatchupBreakdown(makeGame(10.8))
    const downBarrel = downBreakdown.homeBats.pitcherFactors.find(factor => factor.label === 'Barrel%')
    const upBarrel = upBreakdown.homeBats.pitcherFactors.find(factor => factor.label === 'Barrel%')

    expect(downBarrel).toMatchObject({
      direction: 'down',
      description: 'keeps barrel damage down',
    })
    expect(upBarrel).toMatchObject({
      direction: 'up',
      description: 'gives up loud contact',
    })
  })

  it('uses distinct team OBP copy outside neutral', () => {
    const downBreakdown = computeMatchupBreakdown(makeGame(8, 0.298))
    const upBreakdown = computeMatchupBreakdown(makeGame(8, 0.322))
    const downObp = downBreakdown.homeBats.lineupFactors.find(factor => factor.label === 'Team OBP')
    const upObp = upBreakdown.homeBats.lineupFactors.find(factor => factor.label === 'Team OBP')

    expect(downObp).toMatchObject({
      direction: 'down',
      description: 'below-average on-base profile',
    })
    expect(upObp).toMatchObject({
      direction: 'up',
      description: 'above-average on-base profile',
    })
  })
})