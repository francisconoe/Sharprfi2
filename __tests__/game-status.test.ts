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
