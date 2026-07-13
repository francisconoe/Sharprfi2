import { viewProbability, viewOdds, sortForMode, MODE_LABELS } from '@/lib/mode'
import { breakEvenOdds } from '@/lib/poisson'
import type { GameResult } from '@/lib/types'

function stubGame(yrfiProbability: number, gamePk = 1): GameResult {
  return {
    gamePk,
    yrfiProbability,
    breakEvenOdds: breakEvenOdds(yrfiProbability),
  } as GameResult
}

describe('viewProbability', () => {
  it('returns the API probability in yrfi mode', () => {
    expect(viewProbability(stubGame(0.53), 'yrfi')).toBeCloseTo(0.53, 10)
  })

  it('returns the complement in nrfi mode', () => {
    expect(viewProbability(stubGame(0.53), 'nrfi')).toBeCloseTo(0.47, 10)
  })
})

describe('viewOdds', () => {
  it('returns the server break-even odds in yrfi mode', () => {
    const game = stubGame(0.53)
    expect(viewOdds(game, 'yrfi')).toBe(game.breakEvenOdds)
  })

  it('computes break-even odds from the complement in nrfi mode', () => {
    const game = stubGame(0.53)
    expect(viewOdds(game, 'nrfi')).toBe(breakEvenOdds(0.47))
  })
})

describe('sortForMode', () => {
  const games = [stubGame(0.44, 1), stubGame(0.60, 2), stubGame(0.52, 3)]

  it('sorts by YRFI probability descending in yrfi mode', () => {
    expect(sortForMode(games, 'yrfi').map(g => g.gamePk)).toEqual([2, 3, 1])
  })

  it('sorts by NRFI probability descending (reverse order) in nrfi mode', () => {
    expect(sortForMode(games, 'nrfi').map(g => g.gamePk)).toEqual([1, 3, 2])
  })

  it('does not mutate the input array', () => {
    const before = games.map(g => g.gamePk)
    sortForMode(games, 'nrfi')
    expect(games.map(g => g.gamePk)).toEqual(before)
  })
})

describe('MODE_LABELS', () => {
  it('maps modes to display labels', () => {
    expect(MODE_LABELS.yrfi).toBe('YRFI')
    expect(MODE_LABELS.nrfi).toBe('NRFI')
  })
})
