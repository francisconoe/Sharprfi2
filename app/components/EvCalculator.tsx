'use client'

import { useState } from 'react'
import { impliedProbability, expectedValuePerUnit } from '@/lib/sim'
import { MODE_LABELS, type ViewMode } from '@/lib/mode'

// Betting-value layer adapted from Francisco Nevarez's model:
// enter your book's American odds for the active side, get the implied
// probability, EV per unit vs the model probability, and a banded verdict.

const OTHER_MODE: Record<ViewMode, ViewMode> = { yrfi: 'nrfi', nrfi: 'yrfi' }

function verdictForProbability(probability: number, mode: ViewMode): { label: string; className: string } {
  const pct = probability * 100
  const side = MODE_LABELS[mode]
  const other = MODE_LABELS[OTHER_MODE[mode]]
  if (pct >= 60) return { label: `BET ${side}`, className: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' }
  if (pct >= 45) return { label: 'NO BET', className: 'bg-amber-500/20 text-amber-300 border border-amber-500/30' }
  if (pct >= 41) return { label: `LEAN ${other}`, className: 'bg-orange-500/20 text-orange-300 border border-orange-500/30' }
  return { label: `BET ${other}`, className: 'bg-rose-500/20 text-rose-300 border border-rose-500/30' }
}

function parseAmericanOdds(raw: string): number | null {
  const cleaned = raw.trim().replace(/^\+/, '')
  if (!/^-?\d+$/.test(cleaned)) return null
  const value = parseInt(cleaned, 10)
  if (Math.abs(value) < 100) return null
  return value
}

export default function EvCalculator({
  probability,
  mode,
}: {
  probability: number
  mode: ViewMode
}) {
  const [oddsInput, setOddsInput] = useState('')
  const odds = parseAmericanOdds(oddsInput)
  const verdict = verdictForProbability(probability, mode)

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3 backdrop-blur-sm shadow-lg">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400">
          Bet value ({MODE_LABELS[mode]})
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${verdict.className}`}>
          {verdict.label}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-2">
          <span className="text-slate-400">Your book&apos;s {MODE_LABELS[mode]} odds</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="-110"
            value={oddsInput}
            onChange={e => setOddsInput(e.target.value)}
            onClick={e => e.stopPropagation()}
            className="w-20 rounded-lg border border-slate-600/50 bg-slate-800/50 px-2 py-1.5 text-center tabular-nums text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
          />
        </label>

        {odds !== null ? (
          <>
            <Metric label="Implied" value={`${(impliedProbability(odds) * 100).toFixed(1)}%`} neutral />
            <Metric label="Model" value={`${(probability * 100).toFixed(1)}%`} neutral />
            <Metric
              label="EV / unit"
              value={`${expectedValuePerUnit(probability, odds) >= 0 ? '+' : ''}${expectedValuePerUnit(probability, odds).toFixed(3)}`}
              positive={expectedValuePerUnit(probability, odds) > 0}
              neutral={false}
            />
          </>
        ) : oddsInput.trim() !== '' ? (
          <span className="text-slate-400">Enter American odds like -110 or +125</span>
        ) : null}
      </div>
    </div>
  )
}

function Metric({ label, value, positive, neutral }: { label: string; value: string; positive?: boolean; neutral: boolean }) {
  const valueClass = neutral
    ? 'text-slate-300'
    : positive
      ? 'text-emerald-400'
      : 'text-rose-400'
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-slate-700/50 bg-slate-800/30 px-2 py-1.5 backdrop-blur-sm">
      <span className="text-[0.55rem] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <span className={`font-semibold tabular-nums ${valueClass}`}>{value}</span>
    </span>
  )
}