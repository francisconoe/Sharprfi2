'use client'

import { useState } from 'react'
import type { GameResult } from '@/lib/types'
import GameRow from './GameRow'
import MatchupDetail from './MatchupDetail'
import { useSettings, resolveTimezone } from '@/app/context/SettingsContext'
import { getTeamDisplayName } from '@/lib/team-names'
import { viewProbability, viewOdds, getViewTextClass, sortForMode, MODE_LABELS, type ViewMode } from '@/lib/mode'

interface GameTableProps {
  games: GameResult[]
  label: string
}

function formatOddsDisplay(
  american: number,
  format: 'american' | 'decimal',
): string {
  if (format === 'decimal') {
    const decimal = american > 0
      ? (american / 100) + 1
      : (100 / Math.abs(american)) + 1
    return `${decimal.toFixed(2)} or better`
  }
  const display = american === -100 ? '+100' : american > 0 ? `+${american}` : `${american}`
  return `${display} or better`
}

function MobileResultBadge({ game, mode }: { game: GameResult; mode: ViewMode }) {
  const winBadge = 'rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 border border-emerald-500/30'
  const lossBadge = 'rounded-full bg-rose-500/20 px-2.5 py-0.5 text-xs font-semibold text-rose-300 border border-rose-500/30'
  if (game.firstInningResult === 'run') {
    return <span className={mode === 'yrfi' ? winBadge : lossBadge}>RUN</span>
  }
  if (game.firstInningResult === 'no_run') {
    return <span className={mode === 'yrfi' ? lossBadge : winBadge}>NO RUN</span>
  }
  if (game.gameStatus === 'inProgress') {
    return <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-300 border border-amber-500/30">IP</span>
  }
  return <span className="text-slate-500 text-sm">—</span>
}

function PitcherRow({
  label,
  pitcher,
}: {
  label: string
  pitcher: GameResult['homePitcher']
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-800/50 px-3 py-2 border border-slate-700/50">
      <span className="shrink-0 text-slate-400 text-xs font-medium uppercase tracking-wider">{label}</span>
      <span className="min-w-0 text-right font-medium text-slate-200">
        <span className="block w-full truncate">{pitcher.name}</span>
      </span>
    </div>
  )
}

function MobileCard({ game }: { game: GameResult }) {
  const [expanded, setExpanded] = useState(false)
  const { settings } = useSettings()
  const showOddsUnavailable = !game.homePitcher.confirmed || !game.awayPitcher.confirmed
  const showEstimatePrefix = showOddsUnavailable || game.homePitcher.estimated || game.awayPitcher.estimated
  const awayTeam = getTeamDisplayName(game.awayTeam)
  const homeTeam = getTeamDisplayName(game.homeTeam)
  const probability = viewProbability(game, settings.mode)
  const pct = `${showEstimatePrefix ? '~' : ''}${(probability * 100).toFixed(2)}%`
  const odds = showOddsUnavailable ? '—' : formatOddsDisplay(viewOdds(game, settings.mode), settings.oddsFormat)
  const time = new Date(game.gameTime).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: resolveTimezone(settings.timezone),
  })
  const probabilityColorClass = getViewTextClass(probability, settings.mode)

  const tempStr = game.weather.controlled ? 'Roof' : game.weather.failure ? '—' : settings.tempUnit === 'C'
    ? `${Math.round((game.weather.tempF - 32) * 5 / 9)}°C`
    : `${game.weather.tempF}°F`

  const windStr = game.weather.controlled ? 'Roof' : game.weather.failure ? '—' : game.weather.windSpeedMph < 5 ? 'Calm'
    : settings.windUnit === 'kmh'
      ? `${Math.round(game.weather.windSpeedMph * 1.60934)} km/h`
      : `${game.weather.windSpeedMph} mph`
  const weatherSummary = tempStr === 'Roof' && windStr === 'Roof' ? 'Roof' : `${tempStr} · ${windStr}`

  return (
    <article
      className="rounded-2xl border border-slate-700/50 bg-slate-800/40 backdrop-blur-sm shadow-xl cursor-pointer select-none transition-all duration-200 active:scale-[0.98] hover:border-slate-500/50"
      onClick={() => setExpanded(e => !e)}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Matchup</div>
            <div className="mt-1 flex min-w-0 items-center gap-1 text-base font-semibold text-slate-100">
              <span className="truncate text-slate-300">{awayTeam}</span>
              <span className="shrink-0 text-slate-500">@</span>
              <span className="truncate text-slate-50">{homeTeam}</span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">{MODE_LABELS[settings.mode]}</div>
            <div className={`mt-1 text-2xl font-bold tabular-nums ${probabilityColorClass}`}>{pct}</div>
          </div>
        </div>

        <div className="mt-3 grid gap-2 text-sm">
          <PitcherRow label="Away SP" pitcher={game.awayPitcher} />
          <PitcherRow label="Home SP" pitcher={game.homePitcher} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <Metric label="Bet at" value={odds} valueClassName={showOddsUnavailable ? 'text-slate-500' : 'text-slate-200'} />
          <Metric label="Result" value={<MobileResultBadge game={game} mode={settings.mode} />} />
          <Metric label="First pitch" value={time} />
          <Metric label="Weather" value={weatherSummary} />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <div className="border-t border-slate-700/50 px-4 pb-4 pt-3" onClick={e => e.stopPropagation()}>
            <MatchupDetail game={game} />
          </div>
        </div>
      </div>
    </article>
  )
}

export default function GameTable({ games, label }: GameTableProps) {
  const { settings } = useSettings()
  if (games.length === 0) return null

  const sorted = sortForMode(games, settings.mode)

  return (
    <section className="mb-6 sm:mb-8">
      <h2 className="mb-2 px-4 text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</h2>

      {/* Mobile card list */}
      <div className="space-y-3 sm:hidden">
        {sorted.map(g => <MobileCard key={g.gamePk} game={g} />)}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-800/30 backdrop-blur-sm shadow-xl">
        <table className="min-w-[1080px] w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[212px]" />
            <col className="w-[152px]" />
            <col className="w-[152px]" />
            <col className="w-[84px]" />
            <col className="w-[164px]" />
            <col className="w-[68px]" />
            <col className="w-[80px]" />
            <col className="w-[76px]" />
            <col className="w-[92px]" />
          </colgroup>
          <thead className="border-b border-slate-700/50 bg-slate-900/50 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-3 whitespace-nowrap">Matchup</th>
              <th className="px-4 py-3 whitespace-nowrap">Away SP</th>
              <th className="px-4 py-3 whitespace-nowrap">Home SP</th>
              <th className="px-4 py-3 whitespace-nowrap">{MODE_LABELS[settings.mode]} %</th>
              <th className="px-4 py-3 whitespace-nowrap text-center">Bet at</th>
              <th className="px-3 py-3 whitespace-nowrap text-center">Temp</th>
              <th className="px-3 py-3 whitespace-nowrap text-center">Wind</th>
              <th className="px-3 py-3 whitespace-nowrap text-center">Time</th>
              <th className="px-2.5 py-3 whitespace-nowrap text-center">Result</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(g => <GameRow key={g.gamePk} game={g} />)}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Metric({
  label,
  value,
  valueClassName = 'text-slate-200',
}: {
  label: string
  value: React.ReactNode
  valueClassName?: string
}) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 px-3 py-2.5">
      <div className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className={`mt-1 min-w-0 text-sm font-medium ${valueClassName}`}>{value}</div>
    </div>
  )
}