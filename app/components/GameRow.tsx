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

// 🔥 Barra de confianza basada en innings de los pitchers
function ConfidenceBar({ game }: { game: GameResult }) {
  const homeIP = game.homePitcher.estimated ? 0 : (game.homePitcher as any).inningsPitched || 0
  const awayIP = game.awayPitcher.estimated ? 0 : (game.awayPitcher as any).inningsPitched || 0
  const totalIP = homeIP + awayIP
  const confidence = Math.min(1, totalIP / 100) // 100 IP combinados = confianza plena
  const color = confidence > 0.7 ? 'bg-emerald-400' : confidence > 0.4 ? 'bg-amber-400' : 'bg-rose-400'

  return (
    <div className="flex items-center gap-2">
      <span className="text-[0.6rem] font-medium uppercase tracking-wider text-slate-400">
        Conf
      </span>
      <div className="h-1.5 w-16 rounded-full bg-slate-700">
        <div
          className={`h-1.5 rounded-full ${color} transition-all duration-500`}
          style={{ width: `${Math.max(5, confidence * 100)}%` }}
        />
      </div>
    </div>
  )
}

function ResultBadge({ game, mode }: { game: GameResult; mode: ViewMode }) {
  const winBadge = 'inline-flex items-center justify-center whitespace-nowrap rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 border border-emerald-500/30'
  const lossBadge = 'inline-flex items-center justify-center whitespace-nowrap rounded-full bg-rose-500/20 px-2.5 py-0.5 text-xs font-semibold text-rose-300 border border-rose-500/30'
  if (game.firstInningResult === 'run') {
    return <span className={mode === 'yrfi' ? winBadge : lossBadge}>RUN</span>
  }
  if (game.firstInningResult === 'no_run') {
    return <span className={mode === 'yrfi' ? lossBadge : winBadge}>NO RUN</span>
  }
  if (game.gameStatus === 'inProgress') {
    return <span className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-300 border border-amber-500/30">IP</span>
  }
  return <span className="inline-flex w-full justify-center text-slate-500">—</span>
}

function PitcherName({ pitcher }: { pitcher: GameResult['homePitcher'] }) {
  return (
    <span className="block max-w-full truncate whitespace-nowrap text-slate-200">
      {pitcher.name}
    </span>
  )
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
        className="cursor-pointer border-b border-slate-700/50 bg-slate-800/40 hover:bg-slate-700/40 select-none transition-all duration-150 active:scale-[0.998]"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Matchup */}
        <td className="px-4 py-3 align-middle font-medium">
          <span className="flex min-w-0 items-center gap-1 whitespace-nowrap">
            <span className="truncate text-slate-300">{awayTeam}</span>
            <span className="shrink-0 text-slate-500">@</span>
            <span className="truncate text-slate-100">{homeTeam}</span>
          </span>
        </td>
        {/* Away SP */}
        <td className="px-4 py-3 align-middle text-sm">
          <PitcherName pitcher={game.awayPitcher} />
        </td>
        {/* Home SP */}
        <td className="px-4 py-3 align-middle text-sm">
          <PitcherName pitcher={game.homePitcher} />
        </td>
        {/* NRFI/YRFI % */}
        <td className={`px-4 py-3 align-middle whitespace-nowrap tabular-nums font-semibold ${probabilityColorClass}`}>
          {pct}
        </td>
        {/* Bet at */}
        <td className={`px-4 py-3 align-middle whitespace-nowrap text-center text-sm tabular-nums ${showOddsUnavailable ? 'text-slate-500' : 'font-medium text-slate-200'}`}>
          {odds}
        </td>
        {/* Temp */}
        <td className="px-3 py-3 align-middle whitespace-nowrap text-center text-sm text-slate-400">{temp}</td>
        {/* Wind */}
        <td className="px-3 py-3 align-middle whitespace-nowrap text-center text-sm text-slate-400">{wind}</td>
        {/* Time */}
        <td className="px-3 py-3 align-middle whitespace-nowrap text-center text-sm text-slate-400">{time}</td>
        {/* Result + Confidence */}
        <td className="px-2.5 py-3 align-middle whitespace-nowrap">
          <div className="flex items-center justify-end gap-3">
            <ResultBadge game={game} mode={settings.mode} />
            <ConfidenceBar game={game} />
          </div>
        </td>
      </tr>

      <tr>
        <td colSpan={9} className={expanded ? 'border-b border-slate-700/50' : ''} style={{ padding: 0 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateRows: expanded ? '1fr' : '0fr',
              transition: 'grid-template-rows 300ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <div style={{ overflow: 'hidden' }}>
              <div className="bg-slate-900/50 px-6 py-4 backdrop-blur-sm">
                <MatchupDetail game={game} />
              </div>
            </div>
          </div>
        </td>
      </tr>
    </>
  )
}