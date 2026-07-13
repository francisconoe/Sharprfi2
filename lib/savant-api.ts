import Papa from 'papaparse'
import type { SavantStats } from './types'
import { kvGet, kvSet } from './kv'
import {
  dateAdjustedStabilizationSample,
  LEAGUE_AVG_BARREL_PCT,
  LEAGUE_AVG_HARD_HIT_PCT,
  SAVANT_STABILIZATION_IP,
  shrinkTowardAverage,
} from './poisson'

const KV_TTL_SECONDS = 12 * 60 * 60 // 12 hours
const SAVANT_CACHE_VERSION = 'v3'
const MIN_REASONABLE_SAVANT_ROWS = 300
const MIN_VALID_SAVANT_ROWS = 100

function isFiniteStat(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isValidSavantEntry(entry: Partial<SavantStats> | undefined): entry is SavantStats {
  return Boolean(
    entry
    && isFiniteStat(entry.playerId)
    && isFiniteStat(entry.barrelRate)
    && isFiniteStat(entry.hardHitRate)
    && isFiniteStat(entry.inningsPitched)
    && entry.inningsPitched > 0
  )
}

function hasEnoughValidRows(store: SavantStore): boolean {
  let validRows = 0

  for (const entry of Object.values(store)) {
    if (isValidSavantEntry(entry)) {
      validRows += 1
      if (validRows >= MIN_VALID_SAVANT_ROWS) return true
    }
  }

  return false
}

function savantKey(year: number): string {
  return `savant-pitchers:${SAVANT_CACHE_VERSION}:${year}`
}

function parseIP(formatted: string): number {
  const parts = formatted.split('.')
  return parseInt(parts[0], 10) + (parseInt(parts[1] ?? '0', 10)) / 3
}

export type SavantStore = Record<string, SavantStats>

export function parseSavantCsv(csv: string): SavantStore {
  const { data } = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })
  const store: SavantStore = {}

  for (const row of data) {
    const playerId = parseInt(row['player_id'], 10)
    if (isNaN(playerId)) continue

    const barrelRate = parseFloat(
      row['barrel_batted_rate'] ?? row['brl_percent'] ?? '0'
    )
    const hardHitRate = parseFloat(
      row['hard_hit_percent'] ?? row['ev95percent'] ?? '0'
    )
    const ip = row['p_formatted_ip']
      ? parseIP(row['p_formatted_ip'])
      : parseFloat(row['attempts'] ?? '0') / 3

    if (!Number.isFinite(barrelRate) || !Number.isFinite(hardHitRate) || !Number.isFinite(ip) || ip <= 0) {
      continue
    }

    store[String(playerId)] = {
      playerId,
      barrelRate,
      hardHitRate,
      inningsPitched: ip,
    }
  }

  return store
}

export function getSavantStats(
  playerId: number,
  store: SavantStore,
  date?: string,
): Pick<SavantStats, 'barrelRate' | 'hardHitRate' | 'inningsPitched'> & { usedFallback: boolean } {
  const entry = store[String(playerId)]
  if (!isValidSavantEntry(entry)) {
    return {
      barrelRate: LEAGUE_AVG_BARREL_PCT,
      hardHitRate: LEAGUE_AVG_HARD_HIT_PCT,
      inningsPitched: 0,
      usedFallback: true,
    }
  }

  const stabilizationSample = dateAdjustedStabilizationSample(SAVANT_STABILIZATION_IP, date)

  return {
    barrelRate: shrinkTowardAverage(entry.barrelRate, LEAGUE_AVG_BARREL_PCT, entry.inningsPitched, stabilizationSample),
    hardHitRate: shrinkTowardAverage(entry.hardHitRate, LEAGUE_AVG_HARD_HIT_PCT, entry.inningsPitched, stabilizationSample),
    inningsPitched: entry.inningsPitched,
    usedFallback: false,
  }
}

async function fetchSavantCsv(year: number): Promise<string> {
  const url = `https://baseballsavant.mlb.com/leaderboard/statcast?type=pitcher&year=${year}&position=SP,RP&team=&min=1&csv=true`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Savant fetch failed: ${res.status}`)
  return res.text()
}

export async function loadSavantStore(year: number): Promise<SavantStore> {
  const cached = await kvGet<SavantStore>(savantKey(year))
  if (cached && Object.keys(cached).length >= MIN_REASONABLE_SAVANT_ROWS && hasEnoughValidRows(cached)) {
    return cached
  }

  try {
    const csv = await fetchSavantCsv(year)
    const store = parseSavantCsv(csv)
    if (Object.keys(store).length >= MIN_REASONABLE_SAVANT_ROWS && hasEnoughValidRows(store)) {
      await kvSet(savantKey(year), store, KV_TTL_SECONDS)
      return store
    }

    return {}
  } catch {
    return {}
  }
}
