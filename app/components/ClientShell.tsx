'use client'

import { useCallback, useEffect, useState } from 'react'
import type { GamesResponse } from '@/lib/types'
import GameTable from './GameTable'
import StatusBar from './StatusBar'
import DatePicker from './DatePicker'
import LoadingSkeleton from './LoadingSkeleton'
import MethodologyView from './MethodologyView'
import ConfigPanel from './ConfigPanel'
import { SettingsProvider, useSettings } from '@/app/context/SettingsContext'
import { MODE_ACCENT, MODE_LABELS, type ViewMode } from '@/lib/mode'

const mobilePillClass =
  'min-h-10 rounded-full px-4 py-2 text-sm font-medium transition-colors sm:min-h-0 sm:px-4 sm:py-1.5'

function getPacificToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date())
}

type Tab = 'games' | 'methodology'

const MODE_TAGLINES: Record<ViewMode, string> = {
  yrfi: 'Books shade extra vig into public NRFI prices, so why not hunt for EV on the other side?',
  nrfi: 'Six outs. No runs. Find the matchups where elite starters will retire the side with ease.',
}

function ModeToggle() {
  const { settings, update } = useSettings()
  return (
    <div className="flex w-fit shrink-0 rounded-full bg-slate-800/80 p-1 backdrop-blur-sm" role="group" aria-label="Bet type">
      {(['nrfi', 'yrfi'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => update({ mode: m })}
          aria-pressed={settings.mode === m}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${
            settings.mode === m
              ? `${MODE_ACCENT[m].solid} text-white shadow-lg`
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {MODE_LABELS[m]}
        </button>
      ))}
    </div>
  )
}

export default function ClientShell() {
  return (
    <SettingsProvider>
      <Shell />
    </SettingsProvider>
  )
}

function Shell() {
  const { settings } = useSettings()
  const [tab, setTab] = useState<Tab>('games')
  const [date, setDate] = useState(getPacificToday)
  const [data, setData] = useState<GamesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, setTick] = useState(0)

  const fetchData = useCallback(
    async (d: string, silent = false, force = false) => {
      if (!silent) setLoading(true)
      else setRefreshing(true)
      setError(null)
      try {
        const search = new URLSearchParams({ date: d })
        if (force) search.set('force', '1')

        const res = await fetch(`/api/games?${search.toString()}`, {
          cache: force ? 'no-store' : 'default',
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error ?? 'Failed to load')
        }
        const json: GamesResponse = await res.json()
        setData(json)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    []
  )

  useEffect(() => {
    fetchData(date)
  }, [date, fetchData])

  useEffect(() => {
    const interval = setInterval(() => fetchData(date, true), 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [date, fetchData])

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  const upcoming = data?.games.filter((g) => g.gameStatus === 'upcoming') ?? []
  const inProgress =
    data?.games.filter((g) => g.gameStatus === 'inProgress' && g.firstInningResult === 'pending') ?? []
  const settled =
    data?.games.filter(
      (g) => g.gameStatus === 'settled' || (g.gameStatus === 'inProgress' && g.firstInningResult !== 'pending')
    ) ?? []
  const isMethodologyTab = tab === 'methodology'
  const accent = MODE_ACCENT[settings.mode]
  const methodologyButtonClass = `flex items-center justify-center gap-2 ${mobilePillClass} ${
    isMethodologyTab
      ? accent.solidHover
      : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 backdrop-blur-sm border border-slate-700/50'
  }`

  return (
    <>
      {/* 🔥 Fondo con gradiente y efectos de neón */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-[600px] w-[600px] rounded-full bg-purple-500/20 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[400px] rounded-full bg-indigo-400/5 blur-3xl" />
      </div>

      {/* 🔥 Header con efecto glass */}
      <header className="sticky top-0 z-50 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-4">
          <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-3">
            <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
              <h1 className="text-[1.75rem] font-bold leading-none tracking-tight sm:text-[2rem]">
                <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  RenteriaFirstInning
                </span>
              </h1>
              <span className="text-xs font-semibold tracking-tight text-slate-400 sm:text-sm">.com</span>
            </div>
            <span className="max-w-xl text-xs leading-snug text-slate-400 sm:text-sm">
              {MODE_TAGLINES[settings.mode]}
            </span>
          </div>
          <ModeToggle />
        </div>
      </header>

      <div className="mx-auto max-w-7xl">
        {/* 🔥 Nav bar con efecto glass */}
        <div className="flex flex-col gap-3 border-b border-slate-700/50 px-4 py-3 backdrop-blur-sm sm:h-14 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-0">
          <div
            className={`${
              isMethodologyTab
                ? 'grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center'
                : 'flex min-w-0 flex-1 gap-2'
            }`}
          >
            {tab === 'games' ? (
              <DatePicker date={date} onChange={(d) => { setDate(d); setData(null) }} />
            ) : (
              <button
                type="button"
                onClick={() => setTab('games')}
                className={`w-full ${mobilePillClass} bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 backdrop-blur-sm border border-slate-700/50 sm:w-auto`}
              >
                ← Back to games
              </button>
            )}
            {isMethodologyTab ? (
              <button
                type="button"
                onClick={() => setTab('methodology')}
                className={`${methodologyButtonClass} w-full sm:hidden`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                <span>Methodology</span>
              </button>
            ) : null}
          </div>
          <div
            className={`${
              isMethodologyTab
                ? 'hidden sm:flex sm:w-auto sm:items-center sm:justify-end'
                : 'grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center sm:justify-end'
            }`}
          >
            {tab === 'games' && <ConfigPanel />}
            <button
              type="button"
              onClick={() => setTab('methodology')}
              className={methodologyButtonClass}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              <span>Methodology</span>
            </button>
          </div>
        </div>

        {/* Methodology tab */}
        {tab === 'methodology' && <MethodologyView />}

        {/* Games tab */}
        {tab === 'games' && (
          <>
            {data && (
              <StatusBar
                generatedAt={data.generatedAt}
                gameCount={data.games.length}
                onRefresh={() => fetchData(date, true, true)}
                refreshing={refreshing}
              />
            )}

            {loading && <LoadingSkeleton />}

            {error && (
              <div className="mx-4 mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200 backdrop-blur-sm">
                <p className="font-medium">Failed to load games</p>
                <p className="mt-1 text-red-300">{error}</p>
                <button
                  onClick={() => fetchData(date)}
                  type="button"
                  className="mt-3 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-500/30"
                >
                  Retry
                </button>
              </div>
            )}

            {!loading && !error && data && (
              <div className="px-4 py-6">
                {data.games.length > 0 && (
                  <div className="mb-5 rounded-2xl border border-slate-700/50 bg-slate-800/40 px-4 py-2.5 backdrop-blur-sm">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="inline-flex w-fit items-center rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-indigo-300">
                        Matchup details
                      </span>
                      <p className="text-sm leading-5 text-slate-300">
                        <span className="hidden sm:inline">
                          Tap on any matchup row for the full breakdown, and check back 30 to 60 minutes before first
                          pitch for the most accurate lineups and weather statistics.
                        </span>
                        <span className="sm:hidden">
                          Tap on any matchup card for the full breakdown, and check back 30 to 60 minutes before first
                          pitch for the most accurate lineups and weather statistics.
                        </span>
                      </p>
                    </div>
                  </div>
                )}
                {data.games.length === 0 && (
                  <p className="text-center text-slate-400">No games scheduled for this date.</p>
                )}
                <GameTable games={upcoming} label="Upcoming" />
                <GameTable games={inProgress} label="In Progress" />
                <GameTable games={settled} label="Settled" />
              </div>
            )}
          </>
        )}

        {/* 🔥 Footer con diseño moderno */}
        <footer className="border-t border-slate-700/50 px-4 py-5 text-sm text-slate-400 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
            <span>
              Built with ❤️ by{' '}
              <span className="font-medium text-slate-200">Francisco Renteria</span>
              {' & '}
              <span className="font-medium text-slate-200">Lucas Reydman</span>
            </span>
            <span className="text-xs text-slate-500">
              © {new Date().getFullYear()} RenteriaFirstInning Predictor
            </span>
          </div>
        </footer>
      </div>
    </>
  )
}