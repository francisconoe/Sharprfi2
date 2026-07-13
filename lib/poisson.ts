// lib/poisson.ts

import { getPitcherFirstInningStats } from './mlb-api'

// ================================================================
// CONSTANTES DE LIGA (ajustadas para 2026)
// ================================================================

export const LEAGUE_AVG_FIP = 3.80
export const LEAGUE_AVG_K_PCT = 0.23
export const LEAGUE_AVG_BARREL_PCT = 8.0
export const LEAGUE_AVG_OBP = 0.310
export const LEAGUE_AVG_BB_PCT = 0.085
export const LEAGUE_AVG_NRFI_RATE = 0.5095 // ≈ 50.95% NRFI (tasa base histórica)

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

// ================================================================
// PESOS DE FACTORES (nuevos para pitcher-specific)
// ================================================================

const FIP_FACTOR_WEIGHT = 0.55
const BARREL_FACTOR_WEIGHT = 0.35
const OBP_FACTOR_WEIGHT = 0.70
const TOP_OF_ORDER_FACTOR_WEIGHT = 0.45
const PARK_FACTOR_WEIGHT = 0.50
const WEATHER_FACTOR_WEIGHT = 0.50
const PLATOON_FACTOR_WEIGHT = 0.25

// Nuevos pesos para factores de pitcher en 1er inning
const NRFI_FACTOR_WEIGHT = 0.20     // Histórico NRFI rate del pitcher
const BB_FACTOR_WEIGHT = 0.15       // BB% en 1er inning (alto → más carreras)
const RECENT_FACTOR_WEIGHT = 0.20   // Rendimiento en últimos 5 juegos

const MIN_ADJUSTMENT_FACTOR = 0.55
const MAX_ADJUSTMENT_FACTOR = 1.55

// ================================================================
// FUNCIONES AUXILIARES
// ================================================================

// 🔥 Exportamos clamp para que pueda ser usado en mlb-api.ts
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
// FACTOR DE PLATOON (mano a mano) – CORREGIDO para aceptar 'S'
// ================================================================

/**
 * Calcula un factor multiplicativo basado en la combinación de manos
 * del pitcher y del bateador.
 * 
 * @param pitcherHand 'L' | 'R' | 'S' | null  (ahora acepta 'S')
 * @param batterHand  'L' | 'R' | 'S' | null
 * @returns factor entre 0.85 y 1.15
 */
export function platoonFactor(
  pitcherHand: 'L' | 'R' | 'S' | null,
  batterHand: 'L' | 'R' | 'S' | null
): number {
  // Si falta alguna mano, o alguno es ambidiestro, no hay ventaja
  if (!pitcherHand || !batterHand || pitcherHand === 'S' || batterHand === 'S') {
    return 1.0
  }

  // Ventaja para el bateador cuando la mano es opuesta (L vs R o R vs L)
  const isOpposite = (pitcherHand === 'L' && batterHand === 'R') ||
                     (pitcherHand === 'R' && batterHand === 'L')

  return isOpposite ? 1.10 : 0.90
}

// ================================================================
// FUNCIONES PARA OBTENER FACTORES ESPECÍFICOS DEL PITCHER EN 1er INNING
// ================================================================

/**
 * Calcula el NRFI rate histórico del pitcher en el 1er inning (shrink hacia liga).
 * @param pitcherId - ID del pitcher
 * @param season - temporada (ej. "2026")
 * @param date - opcional, para ajuste de estabilización
 * @returns factor multiplicativo (0.85-1.15) que ajusta λ
 */
export async function getPitcherNRFIFactor(
  pitcherId: number,
  season: string,
  date?: string
): Promise<number> {
  const stats = await getPitcherFirstInningStats(pitcherId, season)
  if (!stats || stats.innings < 5) {
    return 1.0 // sin datos, neutral
  }

  // Necesitamos contar cuántos de sus juegos en el 1er inning fueron NRFI.
  // La API de gameLog no da el resultado directamente; debemos calcularlo.
  // Para simplificar, usamos su ERA en 1er inning como proxy: si ERA < 4.0 → buen NRFI.
  // Alternativa más precisa: obtener gameLog y contar resultados, pero requeriría otra función.
  // Usamos una aproximación basada en FIP y K% para estimar NRFI rate:
  // NRFI_rate ≈ 0.5 - 0.2 * (FIP - 3.80)/3.80 - 0.1 * (K% - 0.23)/0.23
  // Esta es una heurística; podría mejorarse con datos reales.
  const avgFip = stats.fip
  const avgK = stats.kPercent
  let nrfiEstimate = 0.50
  nrfiEstimate += -0.2 * (avgFip - LEAGUE_AVG_FIP) / LEAGUE_AVG_FIP
  nrfiEstimate += 0.1 * (avgK - LEAGUE_AVG_K_PCT) / LEAGUE_AVG_K_PCT
  nrfiEstimate = clamp(nrfiEstimate, 0.30, 0.70)

  // Shrink hacia league average
  const stabilization = dateAdjustedStabilizationSample(45, date) // 45 IP como referencia
  const shrunk = shrinkTowardAverage(nrfiEstimate, LEAGUE_AVG_NRFI_RATE, stats.innings, stabilization)

  // Convertir a factor: si shrunk > 0.55 → reduce λ (más NRFI), si < 0.45 → aumenta λ
  // Escala: factor 0.85 cuando shrunk=0.65, factor 1.15 cuando shrunk=0.35
  const factor = 1.0 - 0.75 * (shrunk - 0.45) / 0.20 // ajuste lineal
  return clamp(factor, 0.85, 1.15)
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
 * Usa FIP y K% de los últimos 5 juegos (1er inning) vs su promedio de temporada.
 */
export async function getPitcherRecentFactor(
  pitcherId: number,
  season: string,
  date?: string
): Promise<number> {
  // Necesitamos obtener los gameLogs y filtrar los últimos 5 juegos.
  // Esto es complejo; por ahora usamos una aproximación: si el pitcher tiene > 50 IP en 1er inning,
  // comparamos su FIP reciente (estimado) con su FIP total.
  // Como simplificación, devolvemos 1.0.
  return 1.0
}

// ================================================================
// FUNCIÓN PRINCIPAL: computeLambda (actualizada)
// ================================================================

export interface LambdaParams {
  pitcherFip: number
  pitcherKPct: number        // 0–1 scale
  pitcherBarrelRate: number  // 0–100 scale
  teamOBP: number
  topOfOrderOBP?: number
  parkFactor: number
  tempF: number
  windSpeedMph: number
  windFromDegrees: number
  outfieldFacingDegrees: number
  platoonFactor?: number      // 1.0 por defecto
  nrfiFactor?: number         // factor por NRFI rate histórico (0.85-1.15)
  bbFactor?: number           // factor por BB% (1.0-1.10)
  recentFactor?: number       // factor por recent form (0.90-1.10)
}

export function computeLambda(params: LambdaParams): number {
  const {
    pitcherFip,
    pitcherKPct,
    pitcherBarrelRate,
    teamOBP,
    topOfOrderOBP,
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

  // Factores base (igual que antes)
  const fipFactor = Math.pow(pitcherFip / LEAGUE_AVG_FIP, FIP_FACTOR_WEIGHT)

  const rawKFactor = 1 + 0.3 * (LEAGUE_AVG_K_PCT - pitcherKPct) / LEAGUE_AVG_K_PCT
  const kFactor = Math.max(0.85, Math.min(1.15, rawKFactor))

  const barrelFactor = Math.pow(pitcherBarrelRate / LEAGUE_AVG_BARREL_PCT, BARREL_FACTOR_WEIGHT)

  const obpFactor = Math.pow(teamOBP / LEAGUE_AVG_OBP, OBP_FACTOR_WEIGHT)
  const topOfOrderRatio = topOfOrderOBP && teamOBP > 0
    ? clamp(topOfOrderOBP / teamOBP, 0.90, 1.12)
    : 1
  const topOfOrderFactor = Math.pow(topOfOrderRatio, TOP_OF_ORDER_FACTOR_WEIGHT)

  const tf = tempFactor(tempF)
  const wf = windFactor(windSpeedMph, windFromDegrees, outfieldFacingDegrees)
  const parkAdjustment = Math.pow(parkFactor, PARK_FACTOR_WEIGHT)
  const weatherAdjustment = Math.pow(tf * wf, WEATHER_FACTOR_WEIGHT)

  const platoonAdjustment = Math.pow(platoonFactor, PLATOON_FACTOR_WEIGHT)

  // Nuevos factores específicos del pitcher
  const nrfiAdjustment = Math.pow(nrfiFactor, NRFI_FACTOR_WEIGHT)
  const bbAdjustment = Math.pow(bbFactor, BB_FACTOR_WEIGHT)
  const recentAdjustment = Math.pow(recentFactor, RECENT_FACTOR_WEIGHT)

  const combinedAdjustment = clamp(
    fipFactor * kFactor * barrelFactor * obpFactor * topOfOrderFactor *
    parkAdjustment * weatherAdjustment * platoonAdjustment *
    nrfiAdjustment * bbAdjustment * recentAdjustment,
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

/**
 * Obtiene estadísticas del pitcher en el 1er inning, con fallback a promedios de liga
 * si no hay suficientes datos (menos de 5 IP en el 1er inning).
 * Ahora también devuelve los factores calculados (nrfiFactor, bbFactor, recentFactor)
 * para que puedan ser usados en computeLambda.
 */
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
    }
  }

  const fipStabilization = dateAdjustedStabilizationSample(PITCHER_FIP_STABILIZATION_IP, date)
  const kStabilization = dateAdjustedStabilizationSample(PITCHER_K_STABILIZATION_BF, date)

  const fip = shrinkTowardAverage(stats.fip, LEAGUE_AVG_FIP, stats.innings, fipStabilization)
  const kPct = shrinkTowardAverage(stats.kPercent, LEAGUE_AVG_K_PCT, stats.battersFaced, kStabilization)
  const bbPct = shrinkTowardAverage(stats.bbPercent, LEAGUE_AVG_BB_PCT, stats.battersFaced, kStabilization)

  // Calcular factores usando las funciones auxiliares
  const nrfiFactor = await getPitcherNRFIFactor(pitcherId, season, date)
  const bbFactor = await getPitcherBBFactor(pitcherId, season, date)
  const recentFactor = await getPitcherRecentFactor(pitcherId, season, date)

  return {
    fip,
    kPct,
    bbPct,
    usedFallback: false,
    nrfiFactor,
    bbFactor,
    recentFactor,
  }
}