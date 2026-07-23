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

// Brand accent per mode: YRFI (green), NRFI (red) — colores vibrantes y mejor contraste.
export const MODE_ACCENT: Record<
  ViewMode,
  {
    solid: string
    solidHover: string
    ring: string
    link: string
    brandText: string
  }
> = {
  yrfi: {
    // 🔥 Verde vibrante con gradiente y sombra
    solid:
      'bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold shadow-lg shadow-emerald-500/30',
    solidHover:
      'bg-gradient-to-r from-emerald-600 to-green-600 text-white font-bold shadow-xl shadow-emerald-500/40 hover:scale-[1.02] transition-transform',
    ring: 'focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-900',
    link: 'text-emerald-400 font-semibold underline decoration-emerald-400/30 underline-offset-2 transition-all hover:text-emerald-300 hover:decoration-emerald-300',
    brandText: 'text-emerald-400 font-bold drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]',
  },
  nrfi: {
    // 🔥 Rojo vibrante con gradiente y sombra
    solid:
      'bg-gradient-to-r from-rose-600 to-red-600 text-white font-bold shadow-lg shadow-rose-500/30',
    solidHover:
      'bg-gradient-to-r from-rose-700 to-red-700 text-white font-bold shadow-xl shadow-rose-500/40 hover:scale-[1.02] transition-transform',
    ring: 'focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 focus:ring-offset-slate-900',
    link: 'text-rose-400 font-semibold underline decoration-rose-400/30 underline-offset-2 transition-all hover:text-rose-300 hover:decoration-rose-300',
    brandText: 'text-rose-400 font-bold drop-shadow-[0_0_8px_rgba(244,63,94,0.3)]',
  },
}