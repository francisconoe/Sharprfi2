'use client'

import { useState } from 'react'
import type { GameResult } from '@/lib/types'
import { useSettings, resolveTimezone } from '@/app/context/SettingsContext'
import { getTeamDisplayName } from '@/lib/team-names'
import { viewProbability, viewOdds, getViewTextClass, type ViewMode } from '@/lib/mode'
import MatchupDetail from './MatchupDetail'

interface GameRowProps {
  game: GameResult
}

function formatPct(p: number, showEstimatePrefix: boolean): string {
  return `${showEstimatePrefix ? '~' : ''}${(p * 100).toFixed(2)}%`
}

function formatTime(iso: string, timezone: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  })
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

function formatTemp(weather: GameResult['weather'], tempUnit: 'F' | 'C'): string {
  if (weather.controlled) return 'Roof'
  if (weather.failure) return '—'
  return tempUnit === 'C'
    ? `${Math.round((weather.tempF - 32) * 5 / 9)}°C`
    : `${weather.tempF}°F`
}

function formatWind(weather: GameResult['weather'], windUnit: 'mph' | 'kmh'): string {
  if (weather.controlled) return 'Roof'
  if (weather.failure) return '—'
  if (weather.windSpeedMph < 5) return 'Calm'
  return windUnit === 'kmh'
    ? `${Math.round(weather.windSpeedMph * 1.60934)} km/h`
    : `${weather.windSpeedMph} mph`
}

function ResultBadge({ game, mode }: { game: GameResult; mode: ViewMode }) {
  // A run scored is a YRFI win / NRFI loss, and vice versa.
  const winBadge = 'inline-flex items-center justify-center whitespace-nowrap rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700'
  const lossBadge = 'inline-flex items-center justify-center whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600'
  if (game.firstInningResult === 'run') {
    return <span className={mode === 'yrfi' ? winBadge : lossBadge}>RUN</span>
  }
  if (game.firstInningResult === 'no_run') {
    return <span className={mode === 'yrfi' ? lossBadge : winBadge}>NO RUN</span>
  }
  if (game.gameStatus === 'inProgress') {
    return <span className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700">IP</span>
  }
  return <span className="inline-flex w-full justify-center text-slate-300">—</span>
}

function PitcherName({ pitcher }: { pitcher: GameResult['homePitcher'] }) {
  return <span className="block max-w-full truncate whitespace-nowrap">{pitcher.name}</span>
}

export default function GameRow({ game }: GameRowProps) {
  const [expanded, setExpanded] = useState(false)
  const { settings } = useSettings()
  const showOddsUnavailable = !game.homePitcher.confirmed || !game.awayPitcher.confirmed
  const showEstimatePrefix = showOddsUnavailable || game.homePitcher.estimated || game.awayPitcher.estimated
  const awayTeam = getTeamDisplayName(game.awayTeam)
  const homeTeam = getTeamDisplayName(game.homeTeam)
  const probability = viewProbability(game, settings.mode)
  const pct = formatPct(probability, showEstimatePrefix)
  const odds = showOddsUnavailable ? '—' : formatOddsDisplay(viewOdds(game, settings.mode), settings.oddsFormat)
  const temp = formatTemp(game.weather, settings.tempUnit)
  const wind = formatWind(game.weather, settings.windUnit)
  const time = formatTime(game.gameTime, resolveTimezone(settings.timezone))
  const probabilityColorClass = getViewTextClass(probability, settings.mode)

  return (
    <>
      <tr
        className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 select-none transition-[background-color,transform] duration-75 active:scale-[0.998] active:bg-slate-100"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Matchup */}
        <td className="px-4 py-3 align-middle font-medium">
          <span className="flex min-w-0 items-center gap-1 whitespace-nowrap">
            <span className="truncate text-slate-500">{awayTeam}</span>
            <span className="shrink-0 text-slate-300">@</span>
            <span className="truncate">{homeTeam}</span>
          </span>
        </td>
        {/* Away SP */}
        <td className="px-4 py-3 align-middle text-sm text-slate-600">
          <PitcherName pitcher={game.awayPitcher} />
        </td>
        {/* Home SP */}
        <td className="px-4 py-3 align-middle text-sm text-slate-600">
          <PitcherName pitcher={game.homePitcher} />
        </td>
        {/* NRFI/YRFI % */}
        <td className={`px-4 py-3 align-middle whitespace-nowrap tabular-nums font-semibold ${probabilityColorClass}`}>
          {pct}
        </td>
        {/* Bet at */}
        <td className={`px-4 py-3 align-middle whitespace-nowrap text-center text-sm tabular-nums ${showOddsUnavailable ? 'text-slate-300' : 'font-medium text-slate-700'}`}>
          {odds}
        </td>
        {/* Temp */}
        <td className="px-3 py-3 align-middle whitespace-nowrap text-center text-sm text-slate-500">{temp}</td>
        {/* Wind */}
        <td className="px-3 py-3 align-middle whitespace-nowrap text-center text-sm text-slate-500">{wind}</td>
        {/* Time */}
        <td className="px-3 py-3 align-middle whitespace-nowrap text-center text-sm text-slate-500">{time}</td>
        {/* Result */}
        <td className="px-2.5 py-3 align-middle whitespace-nowrap text-center">
          <ResultBadge game={game} mode={settings.mode} />
        </td>
      </tr>

      <tr>
        <td colSpan={9} className={expanded ? 'border-b border-slate-100' : ''} style={{ padding: 0 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateRows: expanded ? '1fr' : '0fr',
              transition: 'grid-template-rows 300ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <div style={{ overflow: 'hidden' }}>
              <div className="bg-slate-50/70 px-6 py-4">
                <MatchupDetail game={game} />
              </div>
            </div>
          </div>
        </td>
      </tr>
    </>
  )
}
