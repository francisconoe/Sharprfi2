import type { GameResult } from '@/lib/types'
import { breakEvenOdds } from '@/lib/poisson'
import { getYrfiTextClass } from '@/lib/yrfi-color'
import { getNrfiTextClass } from '@/lib/nrfi-color'

export type ViewMode = 'nrfi' | 'yrfi'

export const MODE_LABELS: Record<ViewMode, string> = {
  nrfi: 'NRFI',
  yrfi: 'YRFI',
}

// The API returns the canonical YRFI probability; NRFI is its complement.
export function viewProbability(game: GameResult, mode: ViewMode): number {
  return mode === 'yrfi' ? game.yrfiProbability : 1 - game.yrfiProbability
}

export function viewOdds(game: GameResult, mode: ViewMode): number {
  return mode === 'yrfi' ? game.breakEvenOdds : breakEvenOdds(viewProbability(game, mode))
}

export function getViewTextClass(probability: number, mode: ViewMode): string {
  return mode === 'yrfi' ? getYrfiTextClass(probability) : getNrfiTextClass(probability)
}

// Server sorts by YRFI probability descending; NRFI mode wants its own descending order.
export function sortForMode(games: GameResult[], mode: ViewMode): GameResult[] {
  return [...games].sort((a, b) => viewProbability(b, mode) - viewProbability(a, mode))
}

// Brand accent per mode: YRFI keeps its green identity, NRFI its red.
// Literal class strings so Tailwind's compiler picks them up.
export const MODE_ACCENT: Record<ViewMode, {
  solid: string
  solidHover: string
  ring: string
  link: string
  brandText: string
}> = {
  yrfi: {
    solid: 'bg-green-600 text-white',
    solidHover: 'bg-green-600 text-white hover:bg-green-700',
    ring: 'focus:ring-green-500',
    link: 'text-green-700 underline decoration-green-200 underline-offset-2 transition-colors hover:text-green-800',
    brandText: 'text-green-600',
  },
  nrfi: {
    solid: 'bg-red-600 text-white',
    solidHover: 'bg-red-600 text-white hover:bg-red-700',
    ring: 'focus:ring-red-500',
    link: 'text-red-700 underline decoration-red-200 underline-offset-2 transition-colors hover:text-red-800',
    brandText: 'text-red-600',
  },
}
