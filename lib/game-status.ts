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
