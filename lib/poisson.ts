// lib/poisson.ts

import { getPitcherFirstInningStats } from './mlb-api'

// ================================================================
// CONSTANTES DE LIGA (ajustadas para 2026)
// ================================================================

export const LEAGUE_AVG_FIP = 3.80
export const LEAGUE_AVG_K_PCT = 0.23
export const LEAGUE_AVG_BARREL_PCT = 8.0
export const LEAGUE_AVG_OBP = 0.310
export const LEAGUE_AVG_WOBA = 0.315        // 🔥 NUEVO: wOBA promedio de liga
export const LEAGUE_AVG_BB_PCT = 0.085
export const LEAGUE_AVG_BB9 = 3.0           // 🔥 NUEVO: BB/9 promedio de liga
export const LEAGUE_AVG_ERA = 4.00          // 🔥 NUEVO: ERA promedio de liga (para FIE)
export const LEAGUE_AVG_NRFI_RATE = 0.5095

// 🔥 RECALIBRADO para la tasa base de 2026 (51.8% YRFI → 48.2% NRFI)
// λ = -ln(0.482) / 2 ≈ 0.366
export const BASE_LAMBDA = 0.366

export const FIP_CONSTANT = 3.10
export const LEAGUE_AVG_HARD_HIT_PCT = 38.0

// ================================================================
// CONSTANTES DE ESTABILIZACIÓN
// ================================================================

export const PITCHER_FIP_STABILIZATION_IP = 45
export const PITCHER_K_STABILIZATION_BF = 150
export const TEAM_OBP_STABILIZATION_PA = 600
export const SAVANT_STABILIZATION_IP = 50
export const TOP_OF_ORDER_OBP_STABILIZATION_PA = 180
export const PITCHER_ERA_STABILIZATION_IP = 40   // 🔥 NUEVO: para FIE
export const PITCHER_BB9_STABILIZATION_IP = 40   // 🔥 NUEVO: para BB/9

// ================================================================
// PESOS DE FACTORES (actualizados con nuevas variables)
// ================================================================

const FIP_FACTOR_WEIGHT = 0.55
const BARREL_FACTOR_WEIGHT = 0.35
const OBP_FACTOR_WEIGHT = 0.70
const TOP_OF_ORDER_FACTOR_WEIGHT = 0.45
const PARK_FACTOR_WEIGHT = 0.50
const WEATHER_FACTOR_WEIGHT = 0.50
const PLATOON_FACTOR_WEIGHT = 0.25

// Nuevos pesos para factores de pitcher en 1er inning
const NRFI_FACTOR_WEIGHT = 0.20
const BB_FACTOR_WEIGHT = 0.15
const RECENT_FACTOR_WEIGHT = 0.20

// 🔥 NUEVOS PESOS para mejoras
const FIE_FACTOR_WEIGHT = 0.30     // First-Inning ERA
const BB9_FACTOR_WEIGHT = 0.20     // BB/9 rate
const HUMIDITY_FACTOR_WEIGHT = 0.20 // Humedad
const FTTO_FACTOR_WEIGHT = 0.15     // First Time Through Order (placeholder)

const MIN_ADJUSTMENT_FACTOR = 0.55
const MAX_ADJUSTMENT_FACTOR = 1.55

// ================================================================
// FUNCIONES AUXILIARES
// ================================================================

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function shrinkTowardAverage(
  value: number,
  average: number,
  sampleSize: number,
  stabilizationSample: number,
): number {
  if (!Number.isFinite(value)) return average
  if (sampleSize <= 0 || stabilizationSample <= 0) return average

  const weight = sampleSize / (sampleSize + stabilizationSample)
  return average + (value - average) * weight
}

export function stabilizationMultiplierForDate(date: string): number {
  const parsed = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return 1

  const year = parsed.getUTCFullYear()
  const openingWindowStart = Date.UTC(year, 2, 15)
  const stabilizationFloorDate = Date.UTC(year, 6, 1)
  const progress = clamp(
    (parsed.getTime() - openingWindowStart) / (stabilizationFloorDate - openingWindowStart),
    0,
    1,
  )

  return 1.75 - 0.75 * progress
}

export function dateAdjustedStabilizationSample(baseSample: number, date?: string): number {
  if (!date) return baseSample
  return baseSample * stabilizationMultiplierForDate(date)
}

export function tempFactor(tempF: number): number {
  if (tempF < 55) return 0.92
  if (tempF > 80) return 1.06
  return 1.00
}

export function windFactor(
  windSpeedMph: number,
  windFromDegrees: number,
  outfieldFacingDegrees: number,
): number {
  if (windSpeedMph < 10) return 1.00

  let delta = Math.abs(windFromDegrees - outfieldFacingDegrees) % 360
  if (delta > 180) delta = 360 - delta

  if (delta <= 45) return 0.93   // blowing in
  if (delta >= 135) return 1.08  // blowing out
  return 1.00                    // crosswind
}

// ================================================================
// 🔥 NUEVO: FACTOR DE HUMEDAD (Mejora #5)
// ================================================================

/**
 * Factor de humedad relativa.
 * Días húmedos (RH > 70%) → pelota más pesada → menos HR → reduce runs.
 * Días secos (RH < 30%) → pelota más ligera → más HR → aumenta runs.
 */
export function humidityFactor(humidity: number): number {
  if (humidity > 70) return 0.97
  if (humidity < 30) return 1.03
  return 1.00
}

// ================================================================
// 🔥 NUEVO: FACTOR FIE (First-Inning ERA) (Mejora #1)
// ================================================================

/**
 * Factor basado en First-Inning ERA del pitcher.
 * Fórmula: (FIE / 3.50)^0.40, clamp [0.80, 1.20]
 * Exponente 0.40 es más suave que FIP (0.55) por mayor varianza muestral.
 */
export function fieFactor(fie: number): number {
  if (fie <= 0) return 1.0
  const raw = Math.pow(fie / 3.50, 0.40)
  return clamp(raw, 0.80, 1.20)
}

// ================================================================
// 🔥 NUEVO: FACTOR BB/9 (Mejora #2)
// ================================================================

/**
 * Factor basado en BB/9 del pitcher en 1er inning.
 * Shrink hacia 3.0 BB/9 (liga). Clamp ±10%.
 * F_BB = clamp(1 + 0.25 × (3.0 - shrunk_BB9) / 3.0, 0.90, 1.10)
 */
export function bb9Factor(bb9: number): number {
  if (bb9 <= 0) return 1.0
  const raw = 1 + 0.25 * (3.0 - bb9) / 3.0
  return clamp(raw, 0.90, 1.10)
}

// ================================================================
// 🔥 NUEVO: FACTOR FTTO (First Time Through Order) (Mejora #4)
// ================================================================

/**
 * Factor basado en wOBA allowed first time through vs overall.
 * Por ahora placeholder (1.0) hasta que tengamos datos de Savant.
 * F_FTTO = (wOBA_allowed_FTTO / wOBA_allowed_overall)^0.50, clamp [0.90, 1.10]
 */
export function fttoFactor(
  wobaFTTO: number | null,
  wobaOverall: number | null
): number {
  if (!wobaFTTO || !wobaOverall || wobaOverall <= 0) return 1.0
  const raw = Math.pow(wobaFTTO / wobaOverall, 0.50)
  return clamp(raw, 0.90, 1.10)
}

// ================================================================
// FACTOR DE PLATOON (mano a mano)
// ================================================================

export function platoonFactor(
  pitcherHand: 'L' | 'R' | 'S' | null,
  batterHand: 'L' | 'R' | 'S' | null
): number {
  if (!pitcherHand || !batterHand || pitcherHand === 'S' || batterHand === 'S') {
    return 1.0
  }

  const isOpposite = (pitcherHand === 'L' && batterHand === 'R') ||
                     (pitcherHand === 'R' && batterHand === 'L')

  return isOpposite ? 1.10 : 0.90
}

// ================================================================
// FUNCIONES PARA OBTENER FACTORES ESPECÍFICOS DEL PITCHER EN 1er INNING
// ================================================================

export async function getPitcherNRFIFactor(
  pitcherId: number,
  season: string,
  date?: string
): Promise<number> {
  const stats = await getPitcherFirstInningStats(pitcherId, season)
  if (!stats || stats.innings < 5) return 1.0

  const avgFip = stats.fip
  const avgK = stats.kPercent
  let nrfiEstimate = 0.50
  nrfiEstimate += -0.2 * (avgFip - LEAGUE_AVG_FIP) / LEAGUE_AVG_FIP
  nrfiEstimate += 0.1 * (avgK - LEAGUE_AVG_K_PCT) / LEAGUE_AVG_K_PCT
  nrfiEstimate = clamp(nrfiEstimate, 0.30, 0.70)

  const stabilization = dateAdjustedStabilizationSample(45, date)
  const shrunk = shrinkTowardAverage(nrfiEstimate, LEAGUE_AVG_NRFI_RATE, stats.innings, stabilization)

  const factor = 1.0 - 0.75 * (shrunk - 0.45) / 0.20
  return clamp(factor, 0.85, 1.15)
}

export async function getPitcherBBFactor(
  pitcherId: number,
  season: string,
  date?: string
): Promise<number> {
  const stats = await getPitcherFirstInningStats(pitcherId, season)
  if (!stats || stats.innings < 5) return 1.0

  const bbPct = stats.bbPercent
  if (bbPct > 0.10) {
    const extra = clamp((bbPct - 0.10) / 0.08, 0, 1) * 0.08
    return 1.0 + extra
  }
  return 1.0
}

export async function getPitcherRecentFactor(
  pitcherId: number,
  season: string,
  date?: string
): Promise<number> {
  return 1.0 // Placeholder
}

// ================================================================
// 🔥 NUEVAS FUNCIONES PARA OBTENER FIE Y BB/9
// ================================================================

/**
 * Obtiene el First-Inning ERA del pitcher desde stats de 1er inning.
 * @param pitcherId - ID del pitcher
 * @param season - temporada (ej. "2026")
 * @param date - opcional, para ajuste de estabilización
 * @returns FIE shrink hacia liga
 */
export async function getPitcherFIE(
  pitcherId: number,
  season: string,
  date?: string
): Promise<number> {
  const stats = await getPitcherFirstInningStats(pitcherId, season)
  if (!stats || stats.innings < 5) return LEAGUE_AVG_ERA

  const stabilization = dateAdjustedStabilizationSample(PITCHER_ERA_STABILIZATION_IP, date)
  return shrinkTowardAverage(stats.era, LEAGUE_AVG_ERA, stats.innings, stabilization)
}

/**
 * Obtiene el BB/9 del pitcher en 1er inning.
 * @param pitcherId - ID del pitcher
 * @param season - temporada (ej. "2026")
 * @param date - opcional, para ajuste de estabilización
 * @returns BB/9 shrink hacia liga (3.0)
 */
export async function getPitcherBB9(
  pitcherId: number,
  season: string,
  date?: string
): Promise<number> {
  const stats = await getPitcherFirstInningStats(pitcherId, season)
  if (!stats || stats.innings < 5) return LEAGUE_AVG_BB9

  const bb9 = stats.bbPercent * 9 // BB% * 9 ≈ BB/9
  const stabilization = dateAdjustedStabilizationSample(PITCHER_BB9_STABILIZATION_IP, date)
  return shrinkTowardAverage(bb9, LEAGUE_AVG_BB9, stats.innings, stabilization)
}

// ================================================================
// FUNCIÓN PRINCIPAL: computeLambda (actualizada con nuevas variables)
// ================================================================

export interface LambdaParams {
  pitcherFip: number
  pitcherKPct: number        // 0–1 scale
  pitcherBarrelRate: number  // 0–100 scale
  teamOBP: number
  topOfOrderOBP?: number
  // 🔥 NUEVOS PARÁMETROS
  topOfOrderWOBA?: number    // wOBA ponderado top-5 (alternativa a OBP)
  humidity?: number          // Humedad relativa en % (0-100)
  pitcherFIE?: number        // First-Inning ERA del pitcher
  pitcherBB9?: number        // BB/9 del pitcher en 1er inning
  fttoFactor?: number        // First Time Through Order (por defecto 1.0)
  parkFactor: number
  tempF: number
  windSpeedMph: number
  windFromDegrees: number
  outfieldFacingDegrees: number
  platoonFactor?: number
  nrfiFactor?: number
  bbFactor?: number
  recentFactor?: number
}

export function computeLambda(params: LambdaParams): number {
  const {
    pitcherFip,
    pitcherKPct,
    pitcherBarrelRate,
    teamOBP,
    topOfOrderOBP,
    topOfOrderWOBA,           // 🔥 NUEVO
    humidity,                 // 🔥 NUEVO
    pitcherFIE,               // 🔥 NUEVO
    pitcherBB9,               // 🔥 NUEVO
    fttoFactor = 1.0,         // 🔥 NUEVO
    parkFactor,
    tempF,
    windSpeedMph,
    windFromDegrees,
    outfieldFacingDegrees,
    platoonFactor = 1.0,
    nrfiFactor = 1.0,
    bbFactor = 1.0,
    recentFactor = 1.0,
  } = params

  // === FACTORES BASE ===
  const fipFactor = Math.pow(pitcherFip / LEAGUE_AVG_FIP, FIP_FACTOR_WEIGHT)

  const rawKFactor = 1 + 0.3 * (LEAGUE_AVG_K_PCT - pitcherKPct) / LEAGUE_AVG_K_PCT
  const kFactor = Math.max(0.85, Math.min(1.15, rawKFactor))

  const barrelFactor = Math.pow(pitcherBarrelRate / LEAGUE_AVG_BARREL_PCT, BARREL_FACTOR_WEIGHT)

  // === FACTOR OBP (base) ===
  const obpFactor = Math.pow(teamOBP / LEAGUE_AVG_OBP, OBP_FACTOR_WEIGHT)

  // === FACTOR TOP-5 (ahora usa wOBA si está disponible) ===
  let topOfOrderFactor: number
  if (topOfOrderWOBA && topOfOrderWOBA > 0) {
    // Usar wOBA en lugar de OBP (Mejora #3)
    const ratio = clamp(topOfOrderWOBA / LEAGUE_AVG_WOBA, 0.90, 1.12)
    topOfOrderFactor = Math.pow(ratio, TOP_OF_ORDER_FACTOR_WEIGHT)
  } else if (topOfOrderOBP && topOfOrderOBP > 0) {
    // Fallback a OBP (compatibilidad)
    const ratio = clamp(topOfOrderOBP / teamOBP, 0.90, 1.12)
    topOfOrderFactor = Math.pow(ratio, TOP_OF_ORDER_FACTOR_WEIGHT)
  } else {
    topOfOrderFactor = 1.0
  }

  // === FACTORES CLIMÁTICOS ===
  const tf = tempFactor(tempF)
  const wf = windFactor(windSpeedMph, windFromDegrees, outfieldFacingDegrees)
  const parkAdjustment = Math.pow(parkFactor, PARK_FACTOR_WEIGHT)

  // 🔥 Factor de humedad (Mejora #5)
  const humidityFactorValue = humidity !== undefined ? humidityFactor(humidity) : 1.0
  const humidityAdjustment = Math.pow(humidityFactorValue, HUMIDITY_FACTOR_WEIGHT)

  const weatherAdjustment = Math.pow(tf * wf * humidityFactorValue, WEATHER_FACTOR_WEIGHT)

  // === FACTORES DE PITCHER ===
  const platoonAdjustment = Math.pow(platoonFactor, PLATOON_FACTOR_WEIGHT)
  const nrfiAdjustment = Math.pow(nrfiFactor, NRFI_FACTOR_WEIGHT)
  const bbAdjustment = Math.pow(bbFactor, BB_FACTOR_WEIGHT)
  const recentAdjustment = Math.pow(recentFactor, RECENT_FACTOR_WEIGHT)

  // 🔥 NUEVOS FACTORES DE PITCHER (Mejoras #1 y #2)
  const fieFactorValue = pitcherFIE !== undefined ? fieFactor(pitcherFIE) : 1.0
  const fieAdjustment = Math.pow(fieFactorValue, FIE_FACTOR_WEIGHT)

  const bb9FactorValue = pitcherBB9 !== undefined ? bb9Factor(pitcherBB9) : 1.0
  const bb9Adjustment = Math.pow(bb9FactorValue, BB9_FACTOR_WEIGHT)

  // 🔥 Factor FTTO (Mejora #4) - placeholder
  const fttoAdjustment = Math.pow(fttoFactor, FTTO_FACTOR_WEIGHT)

  // === AJUSTE COMBINADO ===
  const combinedAdjustment = clamp(
    fipFactor * kFactor * barrelFactor * obpFactor * topOfOrderFactor *
    parkAdjustment * weatherAdjustment * platoonAdjustment *
    nrfiAdjustment * bbAdjustment * recentAdjustment *
    fieAdjustment * bb9Adjustment * fttoAdjustment * humidityAdjustment,
    MIN_ADJUSTMENT_FACTOR,
    MAX_ADJUSTMENT_FACTOR,
  )

  return BASE_LAMBDA * combinedAdjustment
}

// ================================================================
// FUNCIONES DE PROBABILIDAD Y ODDS
// ================================================================

export function computeYrfiProbability(lambdaHome: number, lambdaAway: number): number {
  const pHomeScores0 = Math.exp(-lambdaHome)
  const pAwayScores0 = Math.exp(-lambdaAway)
  return 1 - pHomeScores0 * pAwayScores0
}

export function computeNrfiProbability(lambdaHome: number, lambdaAway: number): number {
  return Math.exp(-lambdaHome) * Math.exp(-lambdaAway)
}

export function breakEvenOdds(p: number): number {
  if (p >= 0.5) return -Math.ceil((100 * p) / (1 - p))
  return Math.ceil((100 * (1 - p)) / p)
}

export function formatOdds(odds: number, estimated: boolean): string {
  const display = odds === -100 ? '+100' : odds > 0 ? `+${odds}` : `${odds}`
  const prefix = estimated ? '~' : ''
  return `${prefix}${display} or better`
}

// ================================================================
// FUNCIÓN PARA OBTENER ESTADÍSTICAS DEL PITCHER CON FALLBACK
// ================================================================

export async function getPitcherStatsWithFallback(
  pitcherId: number,
  season: string,
  date?: string
): Promise<{
  fip: number
  kPct: number
  bbPct: number
  usedFallback: boolean
  nrfiFactor: number
  bbFactor: number
  recentFactor: number
  // 🔥 NUEVOS CAMPOS
  fie: number
  bb9: number
}> {
  const stats = await getPitcherFirstInningStats(pitcherId, season)
  if (!stats || stats.innings < 5) {
    return {
      fip: LEAGUE_AVG_FIP,
      kPct: LEAGUE_AVG_K_PCT,
      bbPct: LEAGUE_AVG_BB_PCT,
      usedFallback: true,
      nrfiFactor: 1.0,
      bbFactor: 1.0,
      recentFactor: 1.0,
      fie: LEAGUE_AVG_ERA,
      bb9: LEAGUE_AVG_BB9,
    }
  }

  const fipStabilization = dateAdjustedStabilizationSample(PITCHER_FIP_STABILIZATION_IP, date)
  const kStabilization = dateAdjustedStabilizationSample(PITCHER_K_STABILIZATION_BF, date)

  const fip = shrinkTowardAverage(stats.fip, LEAGUE_AVG_FIP, stats.innings, fipStabilization)
  const kPct = shrinkTowardAverage(stats.kPercent, LEAGUE_AVG_K_PCT, stats.battersFaced, kStabilization)
  const bbPct = shrinkTowardAverage(stats.bbPercent, LEAGUE_AVG_BB_PCT, stats.battersFaced, kStabilization)

  const nrfiFactor = await getPitcherNRFIFactor(pitcherId, season, date)
  const bbFactor = await getPitcherBBFactor(pitcherId, season, date)
  const recentFactor = await getPitcherRecentFactor(pitcherId, season, date)

  // 🔥 Calcular FIE y BB/9 con shrinkage
  const fie = await getPitcherFIE(pitcherId, season, date)
  const bb9 = await getPitcherBB9(pitcherId, season, date)

  return {
    fip,
    kPct,
    bbPct,
    usedFallback: false,
    nrfiFactor,
    bbFactor,
    recentFactor,
    fie,
    bb9,
  }
}