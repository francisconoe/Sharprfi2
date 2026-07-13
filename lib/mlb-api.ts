// lib/mlb-api.ts

import {
  TOP_OF_ORDER_OBP_STABILIZATION_PA,
  dateAdjustedStabilizationSample,
  FIP_CONSTANT,
  LEAGUE_AVG_FIP,
  LEAGUE_AVG_K_PCT,
  LEAGUE_AVG_OBP,
  PITCHER_FIP_STABILIZATION_IP,
  PITCHER_K_STABILIZATION_BF,
  TEAM_OBP_STABILIZATION_PA,
  shrinkTowardAverage,
} from './poisson'
import type {
  BatterRow,
  FirstInningPitcherStats,
  FirstInningBatterStats,
} from './types'
import {
  pitcherFirstInningCache,
  batterFirstInningCache,
} from './first-inning-cache'

const MLB_BASE = 'https://statsapi.mlb.com/api/v1'

// --- Schedule ---

export interface MlbScheduleGame {
  gamePk: number
  gameDate: string
  status: { detailedState: string }
  venue: { id: number; name: string }
  teams: {
    home: {
      team: { id: number; name: string }
      probablePitcher?: { id: number; fullName: string }
    }
    away: {
      team: { id: number; name: string }
      probablePitcher?: { id: number; fullName: string }
    }
  }
}

export async function fetchSchedule(date: string): Promise<MlbScheduleGame[]> {
  const url = `${MLB_BASE}/schedule?sportId=1&date=${date}&hydrate=probablePitcher,lineups`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Schedule fetch failed: ${res.status}`)
  const data = await res.json()
  const games: MlbScheduleGame[] = data.dates?.[0]?.games ?? []
  // Filter PPD/cancelled
  return games.filter(
    g => !['Postponed', 'Cancelled', 'Suspended'].includes(g.status.detailedState)
  )
}

// --- Pitcher stats ---

export interface MlbPitcherStatLine {
  homeRuns: number
  baseOnBalls: number
  hitByPitch: number
  strikeOuts: number
  inningsPitched: string  // e.g. "85.2" = 85 2/3 innings
  battersFaced: number
  obp?: string            // OBP against — sim engine input
}

export interface PitcherModelStats {
  fip: number
  kPct: number
  inningsPitched: number
  battersFaced: number
  obpAllowed: number | null // raw OBP against; sim engine applies its own shrinkage
  usedFallback: boolean
}

export interface MlbTeamBattingStatLine {
  obp?: string
  plateAppearances?: number
  atBats?: number
  baseOnBalls?: number
  hitByPitch?: number
  sacrificeFlies?: number
}

export interface TeamOffenseStats {
  obp: number
  plateAppearances: number
  usedFallback: boolean
}

export interface TeamLineupStats {
  topOfOrderOBP: number | null
  batterCount: number
  confirmed: boolean
  batters: BatterRow[]
  simBatters: SimLineupBatter[]  // full order (up to 9) with counting stats
}

// Raw per-batter counting stats for the Monte Carlo sim engine; batSide is
// filled in from a batched /people lookup after extraction.
export interface SimLineupBatter {
  personId: number
  name: string
  battingSlot: number
  singles: number
  doubles: number
  triples: number
  homeRuns: number
  walks: number
  hitByPitch: number
  plateAppearances: number
}

export interface GameLineupStats {
  home: TeamLineupStats
  away: TeamLineupStats
}

interface MlbPlayerBattingStats {
  obp?: string
  plateAppearances?: number
  hits?: number
  doubles?: number
  triples?: number
  homeRuns?: number
  baseOnBalls?: number
  hitByPitch?: number
}

interface MlbGameFeedPlayer {
  person?: { id: number; fullName: string }
  battingOrder?: string
  seasonStats?: {
    batting?: MlbPlayerBattingStats
  }
}

interface MlbGameFeedTeam {
  players?: Record<string, MlbGameFeedPlayer>
}

interface MlbGameFeedResponse {
  liveData?: {
    boxscore?: {
      teams?: {
        home?: MlbGameFeedTeam
        away?: MlbGameFeedTeam
      }
    }
  }
}

function parseIP(ip: string): number {
  const parts = ip.split('.')
  return parseInt(parts[0], 10) + (parseInt(parts[1] ?? '0', 10)) / 3
}

function calcFip(stat: MlbPitcherStatLine): number {
  const ip = parseIP(stat.inningsPitched)
  if (ip === 0) return LEAGUE_AVG_FIP
  return (13 * stat.homeRuns + 3 * (stat.baseOnBalls + stat.hitByPitch) - 2 * stat.strikeOuts) / ip + FIP_CONSTANT
}

function calcKPct(stat: MlbPitcherStatLine): number {
  if (stat.battersFaced === 0) return LEAGUE_AVG_K_PCT
  return stat.strikeOuts / stat.battersFaced
}

function estimateTeamPlateAppearances(stat: MlbTeamBattingStatLine): number {
  const explicitPlateAppearances = stat.plateAppearances ?? 0
  if (explicitPlateAppearances > 0) return explicitPlateAppearances

  return (
    (stat.atBats ?? 0) +
    (stat.baseOnBalls ?? 0) +
    (stat.hitByPitch ?? 0) +
    (stat.sacrificeFlies ?? 0)
  )
}

export async function fetchPitcherStatLine(
  playerId: number,
  season: number
): Promise<MlbPitcherStatLine | null> {
  const url = `${MLB_BASE}/people/${playerId}/stats?stats=season&group=pitching&season=${season}`
  const res = await fetch(url, { next: { revalidate: 300 } })
  if (!res.ok) return null
  const data = await res.json()
  return data.stats?.[0]?.splits?.[0]?.stat ?? null
}

export async function fetchPitcherFipAndKPct(
  playerId: number,
  season: number,
  date?: string,
): Promise<{ fip: number; kPct: number }> {
  const stats = await fetchPitcherModelStats(playerId, season, date)
  return { fip: stats.fip, kPct: stats.kPct }
}

export async function fetchPitcherModelStats(
  playerId: number,
  season: number,
  date?: string,
): Promise<PitcherModelStats> {
  const stat = await fetchPitcherStatLine(playerId, season)
  if (!stat) {
    return {
      fip: LEAGUE_AVG_FIP,
      kPct: LEAGUE_AVG_K_PCT,
      inningsPitched: 0,
      battersFaced: 0,
      obpAllowed: null,
      usedFallback: true,
    }
  }

  const inningsPitched = parseIP(stat.inningsPitched)
  const battersFaced = stat.battersFaced ?? 0
  const rawFip = calcFip(stat)
  const rawKPct = calcKPct(stat)
  const fipStabilization = dateAdjustedStabilizationSample(PITCHER_FIP_STABILIZATION_IP, date)
  const kStabilization = dateAdjustedStabilizationSample(PITCHER_K_STABILIZATION_BF, date)
  const parsedObp = parseFloat(stat.obp ?? '')

  return {
    fip: shrinkTowardAverage(rawFip, LEAGUE_AVG_FIP, inningsPitched, fipStabilization),
    kPct: shrinkTowardAverage(rawKPct, LEAGUE_AVG_K_PCT, battersFaced, kStabilization),
    inningsPitched,
    battersFaced,
    obpAllowed: Number.isFinite(parsedObp) ? parsedObp : null,
    usedFallback: false,
  }
}

// --- Team OBP ---

export async function fetchTeamOBP(teamId: number, season: number): Promise<number> {
  const stats = await fetchTeamOffenseStats(teamId, season)
  return stats.obp
}

export async function fetchTeamOffenseStats(teamId: number, season: number, date?: string): Promise<TeamOffenseStats> {
  const url = `${MLB_BASE}/teams/${teamId}/stats?stats=season&group=hitting&season=${season}`
  const res = await fetch(url, { next: { revalidate: 300 } })
  if (!res.ok) {
    return { obp: LEAGUE_AVG_OBP, plateAppearances: 0, usedFallback: true }
  }

  const data = await res.json()
  const stat: MlbTeamBattingStatLine | null = data.stats?.[0]?.splits?.[0]?.stat ?? null
  if (!stat?.obp) {
    return { obp: LEAGUE_AVG_OBP, plateAppearances: 0, usedFallback: true }
  }

  const plateAppearances = estimateTeamPlateAppearances(stat)
  const stabilizationSample = dateAdjustedStabilizationSample(TEAM_OBP_STABILIZATION_PA, date)
  return {
    obp: shrinkTowardAverage(parseFloat(stat.obp), LEAGUE_AVG_OBP, plateAppearances, stabilizationSample),
    plateAppearances,
    usedFallback: false,
  }
}

// Batter participation weights for the first inning.
// P(batter N comes up) = P(< 3 outs accumulated in PAs 1…N-1).
// Using P(out per PA) = 1 − LEAGUE_AVG_OBP ≈ 0.690:
//   Batters 1–3: 1.000  (two PAs cannot produce 3 outs — guaranteed)
//   Batter 4:    1 − 0.69³               = 0.672
//   Batter 5:    P(X ≤ 2 | Bin(4, 0.69)) = 0.366
const TOP_OF_ORDER_BATTER_WEIGHTS = [1.0, 1.0, 1.0, 0.672, 0.366] as const

/**
 * Extrae la alineación titular (hasta 9 bateadores) con stats de temporada.
 * Si se proporciona `season`, enriquece los datos con estadísticas del 1er inning
 * cuando el bateador tiene suficientes PA en esa entrada.
 */
export async function extractSimLineup(
  players: Record<string, MlbGameFeedPlayer> | undefined,
  season?: string
): Promise<SimLineupBatter[]> {
  if (!players) return []

  // Base: estadísticas de temporada completa
  const baseBatters = Object.values(players)
    .filter(player => {
      const order = parseInt(player.battingOrder ?? '', 10)
      return Number.isFinite(order) && order >= 100 && order <= 900 && order % 100 === 0
    })
    .sort((left, right) => parseInt(left.battingOrder ?? '0', 10) - parseInt(right.battingOrder ?? '0', 10))
    .slice(0, 9)
    .map((player, i) => {
      const batting = player.seasonStats?.batting
      const hits = batting?.hits ?? 0
      const doubles = batting?.doubles ?? 0
      const triples = batting?.triples ?? 0
      const homeRuns = batting?.homeRuns ?? 0
      return {
        personId: player.person?.id ?? 0,
        name: player.person?.fullName ?? `Batter ${i + 1}`,
        battingSlot: i + 1,
        singles: Math.max(hits - doubles - triples - homeRuns, 0),
        doubles,
        triples,
        homeRuns,
        walks: batting?.baseOnBalls ?? 0,
        hitByPitch: batting?.hitByPitch ?? 0,
        plateAppearances: batting?.plateAppearances ?? 0,
      }
    })

  // Si no hay season, devolver los base
  if (!season) return baseBatters

  // Enriquecer con stats del 1er inning (si el bateador tiene ≥ 3 PA en 1er inning)
  const enriched: SimLineupBatter[] = []
  for (const batter of baseBatters) {
    const firstInningStats = await getBatterFirstInningStats(batter.personId, season)
    if (firstInningStats && firstInningStats.pa >= 3) {
      enriched.push({
        ...batter,
        singles: Math.max(firstInningStats.hits - firstInningStats.doubles - firstInningStats.triples - firstInningStats.homeRuns, 0),
        doubles: firstInningStats.doubles,
        triples: firstInningStats.triples,
        homeRuns: firstInningStats.homeRuns,
        walks: firstInningStats.walks,
        hitByPitch: firstInningStats.hitByPitch,
        plateAppearances: firstInningStats.pa,
      })
    } else {
      enriched.push(batter)
    }
  }
  return enriched
}

/**
 * Extrae estadísticas del top de orden (bateadores 1-5) usando OBP del 1er inning
 * cuando esté disponible (≥ 3 PA en el 1er inning), con fallback a OBP de temporada.
 */
export async function extractTopOfOrderStats(
  players: Record<string, MlbGameFeedPlayer> | undefined,
  date?: string,
  season?: string
): Promise<TeamLineupStats> {
  // Obtener simBatters enriquecidos (con stats del 1er inning si están disponibles)
  const simBatters = await extractSimLineup(players, season)

  if (!players) {
    return { topOfOrderOBP: null, batterCount: 0, confirmed: false, batters: [], simBatters }
  }

  const orderedHitters = Object.values(players)
    .filter(player => Boolean(player.battingOrder))
    .sort((left, right) => parseInt(left.battingOrder ?? '0', 10) - parseInt(right.battingOrder ?? '0', 10))
    .slice(0, TOP_OF_ORDER_BATTER_WEIGHTS.length)

  if (orderedHitters.length < 3) {
    return { topOfOrderOBP: null, batterCount: orderedHitters.length, confirmed: false, batters: [], simBatters }
  }

  const stabilizationSample = dateAdjustedStabilizationSample(TOP_OF_ORDER_OBP_STABILIZATION_PA, date)

  let weightedSum = 0
  let totalWeight = 0
  let validCount = 0
  const batters: BatterRow[] = []

  for (let i = 0; i < orderedHitters.length; i++) {
    const player = orderedHitters[i]
    const weight = TOP_OF_ORDER_BATTER_WEIGHTS[i]
    const plateAppearances = player.seasonStats?.batting?.plateAppearances ?? 0

    // Intentar OBP del 1er inning
    let rawObp: number | null = null
    if (season) {
      const firstInningStats = await getBatterFirstInningStats(player.person?.id ?? 0, season)
      if (firstInningStats && firstInningStats.pa >= 3) {
        rawObp = firstInningStats.obp
      }
    }
    // Fallback a OBP de temporada
    if (rawObp === null) {
      rawObp = parseFloat(player.seasonStats?.batting?.obp ?? '')
    }

    if (!Number.isFinite(rawObp)) continue

    const stabilizedObp = shrinkTowardAverage(rawObp, LEAGUE_AVG_OBP, plateAppearances, stabilizationSample)
    weightedSum += stabilizedObp * weight
    totalWeight += weight
    validCount++

    batters.push({
      name: player.person?.fullName ?? `Batter ${i + 1}`,
      battingSlot: i + 1,
      obp: rawObp,
      stabilizedObp,
      plateAppearances,
    })
  }

  if (validCount < 3 || totalWeight === 0) {
    return { topOfOrderOBP: null, batterCount: validCount, confirmed: false, batters: [], simBatters }
  }

  return {
    topOfOrderOBP: weightedSum / totalWeight,
    batterCount: validCount,
    confirmed: true,
    batters,
    simBatters,
  }
}

export async function fetchGameLineupStats(
  gamePk: number,
  date?: string,
  season?: string
): Promise<GameLineupStats> {
  const url = `${MLB_BASE}.1/game/${gamePk}/feed/live`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    return {
      home: { topOfOrderOBP: null, batterCount: 0, confirmed: false, batters: [], simBatters: [] },
      away: { topOfOrderOBP: null, batterCount: 0, confirmed: false, batters: [], simBatters: [] },
    }
  }

  const data: MlbGameFeedResponse = await res.json()
  const teams = data.liveData?.boxscore?.teams

  const [homeStats, awayStats] = await Promise.all([
    extractTopOfOrderStats(teams?.home?.players, date, season),
    extractTopOfOrderStats(teams?.away?.players, date, season),
  ])

  return {
    home: homeStats,
    away: awayStats,
  }
}

// --- Handedness (sim engine) ---

export interface PersonHandedness {
  batSide: 'L' | 'R' | 'S' | null
  pitchHand: 'L' | 'R' | 'S' | null
}

interface MlbPerson {
  id: number
  batSide?: { code?: string }
  pitchHand?: { code?: string }
}

function toHand(code: string | undefined): 'L' | 'R' | 'S' | null {
  return code === 'L' || code === 'R' || code === 'S' ? code : null
}

// One batched /people call covers every batter and pitcher on the slate.
export async function fetchHandedness(
  personIds: number[],
): Promise<Record<number, PersonHandedness>> {
  const uniqueIds = [...new Set(personIds.filter(id => id > 0))]
  const result: Record<number, PersonHandedness> = {}
  if (uniqueIds.length === 0) return result

  // The API accepts long id lists; chunk defensively to keep URLs sane.
  const CHUNK = 100
  for (let i = 0; i < uniqueIds.length; i += CHUNK) {
    const chunk = uniqueIds.slice(i, i + CHUNK)
    const url = `${MLB_BASE}/people?personIds=${chunk.join(',')}&fields=people,id,batSide,pitchHand,code`
    const res = await fetch(url, { next: { revalidate: 86400 } })
    if (!res.ok) continue
    const data = await res.json()
    for (const person of (data.people ?? []) as MlbPerson[]) {
      result[person.id] = {
        batSide: toHand(person.batSide?.code),
        pitchHand: toHand(person.pitchHand?.code),
      }
    }
  }
  return result
}

// --- Team win streaks (sim engine, only when SIM_USE_STREAKS) ---

interface MlbStandingsTeamRecord {
  team?: { id?: number }
  streak?: { streakType?: string; streakNumber?: number }
}

// Current win streak per team (0 when on a losing streak). One call covers
// both leagues.
export async function fetchTeamWinStreaks(season: number): Promise<Record<number, number>> {
  const url = `${MLB_BASE}/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`
  const result: Record<number, number> = {}
  const res = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) return result
  const data = await res.json()
  for (const record of data.records ?? []) {
    for (const teamRecord of (record.teamRecords ?? []) as MlbStandingsTeamRecord[]) {
      const teamId = teamRecord.team?.id
      if (!teamId) continue
      result[teamId] = teamRecord.streak?.streakType === 'wins'
        ? (teamRecord.streak?.streakNumber ?? 0)
        : 0
    }
  }
  return result
}

// --- Linescore ---

export interface MlbLinescore {
  innings: Array<{
    away?: { runs?: number }
    home?: { runs?: number }
  }>
}

export async function fetchLinescore(gamePk: number): Promise<MlbLinescore> {
  const url = `${MLB_BASE}/game/${gamePk}/linescore`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) return { innings: [] }
  return res.json()
}

// ================================================================
// ESTADÍSTICAS DEL 1ER INNING
// ================================================================

/**
 * Obtiene estadísticas de un pitcher en el 1er inning desde MLB API
 * Usa el endpoint gameLog y filtra por inning === '1'
 */
export async function getPitcherFirstInningStats(
  playerId: number,
  season: string
): Promise<FirstInningPitcherStats | null> {
  const cacheKey = `${playerId}-${season}`
  const cached = pitcherFirstInningCache.get(cacheKey)
  if (cached) return cached

  try {
    const url = `${MLB_BASE}/people/${playerId}/stats?stats=gameLog&group=pitching&season=${season}&gameType=R`
    const res = await fetch(url, { next: { revalidate: 300 } })
    if (!res.ok) return null
    const data = await res.json()

    const splits = data.stats?.[0]?.splits || []
    const firstInningSplits = splits.filter((s: any) => s.inning === '1')

    if (firstInningSplits.length === 0) return null

    const totals = firstInningSplits.reduce((acc: any, s: any) => {
      acc.ip += parseFloat(s.ip) || 0
      acc.h += s.h || 0
      acc.er += s.er || 0
      acc.bb += s.bb || 0
      acc.so += s.so || 0
      acc.hr += s.hr || 0
      acc.battersFaced += s.battersFaced || 0
      return acc
    }, { ip: 0, h: 0, er: 0, bb: 0, so: 0, hr: 0, battersFaced: 0 })

    if (totals.ip === 0 || totals.battersFaced === 0) return null

    const fip = (13 * totals.hr + 3 * totals.bb - 2 * totals.so) / totals.ip + FIP_CONSTANT
    const kPercent = totals.so / totals.battersFaced
    const bbPercent = totals.bb / totals.battersFaced
    const era = (totals.er / totals.ip) * 9

    const stats: FirstInningPitcherStats = {
      fip,
      kPercent,
      bbPercent,
      innings: totals.ip,
      battersFaced: totals.battersFaced,
      era,
    }

    pitcherFirstInningCache.set(cacheKey, stats)
    return stats
  } catch (error) {
    console.error(`Error fetching 1st inning stats for pitcher ${playerId}:`, error)
    return null
  }
}

/**
 * Obtiene estadísticas detalladas de un bateador en el 1er inning.
 * Devuelve conteos de hits, dobles, triples, HR, walks, HBP, y PA.
 */
export async function getBatterFirstInningStats(
  playerId: number,
  season: string
): Promise<FirstInningBatterStats | null> {
  const cacheKey = `${playerId}-${season}`
  const cached = batterFirstInningCache.get(cacheKey)
  if (cached) return cached

  try {
    const url = `${MLB_BASE}/people/${playerId}/stats?stats=gameLog&group=hitting&season=${season}&gameType=R`
    const res = await fetch(url, { next: { revalidate: 300 } })
    if (!res.ok) return null
    const data = await res.json()

    const splits = data.stats?.[0]?.splits || []
    const firstInningSplits = splits.filter((s: any) => s.inning === '1')

    if (firstInningSplits.length === 0) return null

    const totals = firstInningSplits.reduce((acc: any, s: any) => {
      acc.ab += s.ab || 0
      acc.h += s.h || 0
      acc.doubles += s.doubles || 0
      acc.triples += s.triples || 0
      acc.homeRuns += s.homeRuns || 0
      acc.walks += s.baseOnBalls || 0
      acc.hbp += s.hitByPitch || 0
      acc.sf += s.sacrificeFlies || 0
      acc.pa += (s.ab || 0) + (s.baseOnBalls || 0) + (s.hitByPitch || 0) + (s.sacrificeFlies || 0)
      return acc
    }, { ab: 0, h: 0, doubles: 0, triples: 0, homeRuns: 0, walks: 0, hbp: 0, sf: 0, pa: 0 })

    if (totals.pa === 0) return null

    const obp = (totals.h + totals.walks + totals.hbp) / totals.pa
    const avg = totals.h / totals.ab || 0
    const woba = (0.69 * totals.walks + 0.72 * totals.hbp + 0.87 * (totals.h - totals.doubles - totals.triples - totals.homeRuns) + 1.24 * totals.doubles + 1.56 * totals.triples + 1.95 * totals.homeRuns) / totals.pa

    const stats: FirstInningBatterStats = {
      obp,
      avg,
      woba,
      pa: totals.pa,
      hits: totals.h,
      doubles: totals.doubles,
      triples: totals.triples,
      homeRuns: totals.homeRuns,
      walks: totals.walks,
      hitByPitch: totals.hbp,
    }

    batterFirstInningCache.set(cacheKey, stats)
    return stats
  } catch (error) {
    console.error(`Error fetching 1st inning stats for batter ${playerId}:`, error)
    return null
  }
}

// ================================================================
// PLATOON SPLITS (MANO A MANO)
// ================================================================

/**
 * Obtiene estadísticas de un pitcher en el 1er inning contra bateadores
 * de una mano específica (LHP o RHP).
 */
export async function getPitcherFirstInningSplitStats(
  playerId: number,
  season: string,
  split: 'vsLHH' | 'vsRHH'
): Promise<FirstInningPitcherStats | null> {
  try {
    const url = `${MLB_BASE}/people/${playerId}/stats?stats=gameLog&group=pitching&season=${season}&gameType=R&split=${split}`
    const res = await fetch(url, { next: { revalidate: 300 } })
    if (!res.ok) return null
    const data = await res.json()

    const splits = data.stats?.[0]?.splits || []
    const firstInningSplits = splits.filter((s: any) => s.inning === '1')

    if (firstInningSplits.length === 0) return null

    const totals = firstInningSplits.reduce((acc: any, s: any) => {
      acc.ip += parseFloat(s.ip) || 0
      acc.h += s.h || 0
      acc.er += s.er || 0
      acc.bb += s.bb || 0
      acc.so += s.so || 0
      acc.hr += s.hr || 0
      acc.battersFaced += s.battersFaced || 0
      return acc
    }, { ip: 0, h: 0, er: 0, bb: 0, so: 0, hr: 0, battersFaced: 0 })

    if (totals.ip === 0 || totals.battersFaced === 0) return null

    const fip = (13 * totals.hr + 3 * totals.bb - 2 * totals.so) / totals.ip + FIP_CONSTANT
    const kPercent = totals.so / totals.battersFaced
    const bbPercent = totals.bb / totals.battersFaced
    const era = (totals.er / totals.ip) * 9

    return {
      fip,
      kPercent,
      bbPercent,
      innings: totals.ip,
      battersFaced: totals.battersFaced,
      era,
    }
  } catch (error) {
    console.error(`Error fetching ${split} split for pitcher ${playerId}:`, error)
    return null
  }
}

/**
 * Obtiene estadísticas de un bateador en el 1er inning contra lanzadores
 * de una mano específica (LHP o RHP).
 */
export async function getBatterFirstInningSplitStats(
  playerId: number,
  season: string,
  split: 'vsLHP' | 'vsRHP'
): Promise<FirstInningBatterStats | null> {
  try {
    const url = `${MLB_BASE}/people/${playerId}/stats?stats=gameLog&group=hitting&season=${season}&gameType=R&split=${split}`
    const res = await fetch(url, { next: { revalidate: 300 } })
    if (!res.ok) return null
    const data = await res.json()

    const splits = data.stats?.[0]?.splits || []
    const firstInningSplits = splits.filter((s: any) => s.inning === '1')

    if (firstInningSplits.length === 0) return null

    const totals = firstInningSplits.reduce((acc: any, s: any) => {
      acc.ab += s.ab || 0
      acc.h += s.h || 0
      acc.doubles += s.doubles || 0
      acc.triples += s.triples || 0
      acc.homeRuns += s.homeRuns || 0
      acc.walks += s.baseOnBalls || 0
      acc.hbp += s.hitByPitch || 0
      acc.sf += s.sacrificeFlies || 0
      acc.pa += (s.ab || 0) + (s.baseOnBalls || 0) + (s.hitByPitch || 0) + (s.sacrificeFlies || 0)
      return acc
    }, { ab: 0, h: 0, doubles: 0, triples: 0, homeRuns: 0, walks: 0, hbp: 0, sf: 0, pa: 0 })

    if (totals.pa === 0) return null

    const obp = (totals.h + totals.walks + totals.hbp) / totals.pa
    const avg = totals.h / totals.ab || 0
    const woba = (0.69 * totals.walks + 0.72 * totals.hbp + 0.87 * (totals.h - totals.doubles - totals.triples - totals.homeRuns) + 1.24 * totals.doubles + 1.56 * totals.triples + 1.95 * totals.homeRuns) / totals.pa

    return {
      obp,
      avg,
      woba,
      pa: totals.pa,
      hits: totals.h,
      doubles: totals.doubles,
      triples: totals.triples,
      homeRuns: totals.homeRuns,
      walks: totals.walks,
      hitByPitch: totals.hbp,
    }
  } catch (error) {
    console.error(`Error fetching ${split} split for batter ${playerId}:`, error)
    return null
  }
}

// ================================================================
// OBP AJUSTADO POR PLATOON (CON MANO DEL PITCHER)
// ================================================================

/**
 * Calcula el OBP ajustado por platoon para un bateador contra un pitcher específico.
 * Usa splits de 1er inning si están disponibles (PA >= 3), con fallback a OBP general de 1er inning
 * y finalmente a promedio de liga.
 * 
 * @param batterId - ID del bateador
 * @param pitcherId - ID del pitcher
 * @param season - temporada en formato string (ej. "2026")
 * @param handednessMap - mapa de manos (obtenido con fetchHandedness) para evitar llamadas extra
 * @param date - opcional, para ajustes de estabilización
 * @returns OBP ajustado (0-1)
 */
export async function getPlatoonAdjustedOBP(
  batterId: number,
  pitcherId: number,
  season: string,
  handednessMap: Record<number, PersonHandedness>,
  date?: string
): Promise<number> {
  const pitcherHand = handednessMap[pitcherId]?.pitchHand ?? null
  const batterHand = handednessMap[batterId]?.batSide ?? null

  // Si el pitcher no tiene mano o el bateador es ambidiestro, usar OBP general de 1er inning
  if (!pitcherHand || !batterHand || batterHand === 'S') {
    const stats = await getBatterFirstInningStats(batterId, season)
    if (stats && stats.pa >= 3) return stats.obp
    return LEAGUE_AVG_OBP
  }

  const splitKey = pitcherHand === 'L' ? 'vsLHP' : 'vsRHP'
  const splitStats = await getBatterFirstInningSplitStats(
    batterId,
    season,
    splitKey as 'vsLHP' | 'vsRHP'
  )

  if (splitStats && splitStats.pa >= 3) {
    return splitStats.obp
  }

  const generalStats = await getBatterFirstInningStats(batterId, season)
  if (generalStats && generalStats.pa >= 3) {
    return generalStats.obp
  }

  return LEAGUE_AVG_OBP
}

// ================================================================
// NUEVAS FUNCIONES PARA FACTORES DE PITCHER (NRFI RATE, BB%, RECENT)
// ================================================================

/**
 * Obtiene el historial de juegos del pitcher en el 1er inning.
 * Devuelve un array con cada juego y su resultado (si fue NRFI o no).
 * Útil para calcular NRFI rate histórico.
 */
export async function getPitcherFirstInningGameLogs(
  playerId: number,
  season: string
): Promise<Array<{ gamePk: number; date: string; innings: number; runs: number; er: number; bb: number; so: number; hr: number; nrfi: boolean }>> {
  try {
    const url = `${MLB_BASE}/people/${playerId}/stats?stats=gameLog&group=pitching&season=${season}&gameType=R`
    const res = await fetch(url, { next: { revalidate: 300 } })
    if (!res.ok) return []
    const data = await res.json()

    const splits = data.stats?.[0]?.splits || []
    const firstInningSplits = splits.filter((s: any) => s.inning === '1')

    if (firstInningSplits.length === 0) return []

    return firstInningSplits.map((s: any) => {
      const runs = s.runs || 0
      const er = s.er || 0
      const ip = parseFloat(s.ip) || 0
      return {
        gamePk: s.gamePk || 0,
        date: s.date || '',
        innings: ip,
        runs,
        er,
        bb: s.baseOnBalls || 0,
        so: s.strikeOuts || 0,
        hr: s.homeRuns || 0,
        nrfi: runs === 0 && ip > 0,
      }
    })
  } catch (error) {
    console.error(`Error fetching 1st inning game logs for pitcher ${playerId}:`, error)
    return []
  }
}

/**
 * Calcula el NRFI rate histórico del pitcher en el 1er inning (shrink hacia liga).
 * @param pitcherId - ID del pitcher
 * @param season - temporada (ej. "2026")
 * @param date - opcional, para ajuste de estabilización
 * @returns factor multiplicativo (0.85-1.15) que ajusta λ
 */
export async function getPitcherNRFIRateFactor(
  pitcherId: number,
  season: string,
  date?: string
): Promise<number> {
  const gameLogs = await getPitcherFirstInningGameLogs(pitcherId, season)
  const totalGames = gameLogs.length

  // Si menos de 5 juegos, no hay suficiente muestra → neutral
  if (totalGames < 5) {
    return 1.0
  }

  const nrfiCount = gameLogs.filter(g => g.nrfi).length
  const rawRate = nrfiCount / totalGames

  // Shrink hacia league average (≈50.95%)
  const stabilization = dateAdjustedStabilizationSample(45, date) // 45 IP como referencia
  const shrunk = shrinkTowardAverage(rawRate, 0.5095, totalGames, stabilization)

  // Convertir a factor: si shrunk > 0.55 → reduce λ (más NRFI), si < 0.45 → aumenta λ
  // Escala: factor 0.85 cuando shrunk=0.65, factor 1.15 cuando shrunk=0.35
  let factor = 1.0 - 0.75 * (shrunk - 0.45) / 0.20
  factor = clamp(factor, 0.85, 1.15)
  return factor
}

/**
 * Calcula un factor basado en BB% del pitcher en 1er inning.
 * Si BB% > 10%, aumenta λ (más carreras).
 */
export async function getPitcherBBFactor(
  pitcherId: number,
  season: string,
  date?: string
): Promise<number> {
  const stats = await getPitcherFirstInningStats(pitcherId, season)
  if (!stats || stats.innings < 5) {
    return 1.0
  }

  const bbPct = stats.bbPercent
  if (bbPct > 0.10) {
    // Aumentar λ entre 1.02 y 1.10 según BB%
    const extra = clamp((bbPct - 0.10) / 0.08, 0, 1) * 0.08 // max 8% extra
    return 1.0 + extra
  }
  return 1.0
}

/**
 * Calcula un factor basado en el rendimiento reciente (últimos 5 juegos) del pitcher.
 * Compara FIP y K% de los últimos 5 juegos vs su promedio de temporada.
 */
export async function getPitcherRecentFactor(
  pitcherId: number,
  season: string,
  date?: string
): Promise<number> {
  const gameLogs = await getPitcherFirstInningGameLogs(pitcherId, season)
  if (gameLogs.length < 5) {
    return 1.0 // no hay suficiente muestra
  }

  // Ordenar por fecha (asumiendo que vienen en orden, o usar sort)
  const sorted = gameLogs.sort((a, b) => (a.date < b.date ? -1 : 1))
  const recent = sorted.slice(-5) // últimos 5 juegos

  // Calcular FIP y K% en los últimos 5 juegos
  let totalIP = 0
  let totalHR = 0
  let totalBB = 0
  let totalSO = 0
  let totalBF = 0

  for (const game of recent) {
    totalIP += game.innings
    totalHR += game.hr
    totalBB += game.bb
    totalSO += game.so
    // Estimamos batters faced: IP * 3 + BB + SO (aproximado)
    totalBF += Math.round(game.innings * 3) + game.bb + game.so
  }

  if (totalIP === 0) return 1.0

  const recentFIP = (13 * totalHR + 3 * totalBB - 2 * totalSO) / totalIP + FIP_CONSTANT
  const recentK = totalBF > 0 ? totalSO / totalBF : LEAGUE_AVG_K_PCT

  // Comparar con estadísticas de temporada completa (usando el cache)
  const seasonStats = await getPitcherFirstInningStats(pitcherId, season)
  if (!seasonStats) return 1.0

  const seasonFIP = seasonStats.fip
  const seasonK = seasonStats.kPercent

  // Si el FIP reciente es mejor (más bajo) → reduce λ
  const fipDiff = (seasonFIP - recentFIP) / seasonFIP
  // Si el K% reciente es mejor (más alto) → reduce λ
  const kDiff = (recentK - seasonK) / seasonK

  // Factor combinado: si mejora en ambos, factor < 1; si empeora, factor > 1
  let factor = 1.0 - 0.3 * fipDiff - 0.1 * kDiff
  factor = clamp(factor, 0.90, 1.10)
  return factor
}