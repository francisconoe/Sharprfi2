import {
  LEAGUE_AVG_FIP,
  LEAGUE_AVG_K_PCT,
  LEAGUE_AVG_BARREL_PCT,
  LEAGUE_AVG_OBP,
  tempFactor,
  windFactor,
} from './poisson'
import { getOutfieldFacingDegrees } from './weather-api'
import type { GameResult, PitcherStats } from './types'
import type { Settings } from '@/app/context/SettingsContext'

export interface FactorBadge {
  label: string
  multiplier: number
  direction: 'up' | 'down' | 'neutral'
  description: string
}

export interface HalfInningBreakdown {
  pitcherFactors: FactorBadge[]
  lineupFactors: FactorBadge[]
  envFactors: FactorBadge[]
  lambda: number
}

export interface MatchupBreakdown {
  homeBats: HalfInningBreakdown  // home lineup bats vs away pitcher
  awayBats: HalfInningBreakdown  // away lineup bats vs home pitcher
}

function dir(m: number): 'up' | 'down' | 'neutral' {
  if (m > 1.025) return 'up'
  if (m < 0.975) return 'down'
  return 'neutral'
}

function impactDescription(
  multiplier: number,
  descriptions: {
    strongDown: string
    down: string
    neutral: string
    up: string
    strongUp: string
  },
): string {
  if (multiplier <= 0.94) return descriptions.strongDown
  if (multiplier < 0.975) return descriptions.down
  if (multiplier <= 1.025) return descriptions.neutral
  if (multiplier < 1.06) return descriptions.up
  return descriptions.strongUp
}

function badge(label: string, multiplier: number, description: string): FactorBadge {
  return { label, multiplier, direction: dir(multiplier), description }
}

function pitcherFactors(p: PitcherStats): FactorBadge[] {
  const fipM = Math.pow(p.fip / LEAGUE_AVG_FIP, 0.55)
  const rawK = 1 + 0.3 * (LEAGUE_AVG_K_PCT - p.kPct) / LEAGUE_AVG_K_PCT
  const kM = Math.max(0.85, Math.min(1.15, rawK))
  const barrelM = Math.pow(p.barrelRate / LEAGUE_AVG_BARREL_PCT, 0.35)

  const fipDesc = impactDescription(fipM, {
    strongDown: 'excellent run prevention',
    down: 'better than league-average FIP',
    neutral: 'near average',
    up: 'worse than league-average FIP',
    strongUp: 'run-prone FIP',
  })

  const kDesc = impactDescription(kM, {
    strongDown: 'bat-missing strikeout rate',
    down: 'above-average strikeout rate',
    neutral: 'average K rate',
    up: 'below-average strikeout rate',
    strongUp: 'contact-heavy strikeout rate',
  })

  const barrelDesc = impactDescription(barrelM, {
    strongDown: 'limits hard contact',
    down: 'keeps barrel damage down',
    neutral: 'average barrel rate',
    up: 'elevated barrel rate',
    strongUp: 'gives up loud contact',
  })

  return [
    badge('FIP', fipM, fipDesc),
    badge('K%', kM, kDesc),
    badge('Barrel%', barrelM, barrelDesc),
  ]
}

function lineupFactors(
  teamOBP: number,
  topOfOrderOBP: number | null,
): FactorBadge[] {
  const obpM = Math.pow(teamOBP / LEAGUE_AVG_OBP, 0.70)
  const obpDesc = impactDescription(obpM, {
    strongDown: 'low-on-base lineup',
    down: 'below-average on-base profile',
    neutral: 'average OBP',
    up: 'above-average on-base profile',
    strongUp: 'constant baserunner pressure',
  })
  const badges: FactorBadge[] = [badge('Team OBP', obpM, obpDesc)]

  if (topOfOrderOBP !== null && teamOBP > 0) {
    const ratio = Math.min(Math.max(topOfOrderOBP / teamOBP, 0.90), 1.12)
    const topM = Math.pow(ratio, 0.45)
    const topDesc = impactDescription(topM, {
      strongDown: 'soft top of order',
      down: 'lighter top-of-order threat',
      neutral: 'average top of order',
      up: 'strong top-of-order threat',
      strongUp: 'dangerous top of order',
    })
    badges.push(badge('Top of order', topM, topDesc))
  }

  return badges
}

export function computeMatchupBreakdown(
  game: GameResult,
  settings?: Pick<Settings, 'tempUnit' | 'windUnit'>,
): MatchupBreakdown {
  const tempUnit = settings?.tempUnit ?? 'F'
  const windUnit = settings?.windUnit ?? 'mph'

  const { homePitcher, awayPitcher, homeOBP, awayOBP, topOfOrderOBP, weather, parkFactor } = game
  const outfieldFacing = getOutfieldFacingDegrees(game.venueId)

  const isControlled = weather.controlled || weather.failure
  const tempF = isControlled ? 72 : weather.tempF
  const windSpeedMph = isControlled ? 0 : weather.windSpeedMph
  const windFromDegrees = isControlled ? 0 : weather.windFromDegrees

  const tf = tempFactor(tempF)
  const wf = windFactor(windSpeedMph, windFromDegrees, outfieldFacing)

  const parkM = Math.pow(parkFactor, 0.50)
  const parkDesc =
    parkFactor > 1.05 ? `${((parkFactor - 1) * 100).toFixed(0)}% above avg — hitter-friendly` :
    parkFactor < 0.95 ? `${((1 - parkFactor) * 100).toFixed(0)}% below avg — pitcher-friendly` :
    'neutral park'

  const tempM = Math.pow(tf, 0.50)
  const tempDisplay = tempUnit === 'C'
    ? `${Math.round((tempF - 32) * 5 / 9)}°C`
    : `${tempF}°F`
  const tempDesc =
    tf < 1 ? `${tempDisplay} — cold suppresses scoring` :
    tf > 1 ? `${tempDisplay} — warm boosts scoring` :
    `${tempDisplay} — neutral`

  const windM = Math.pow(wf, 0.50)
  const windDisplay = (spd: number) => windUnit === 'kmh'
    ? `${Math.round(spd * 1.60934)} km/h`
    : `${spd} mph`
  let windDesc = 'calm — no effect'
  if (!isControlled && windSpeedMph >= 10) {
    let delta = Math.abs(windFromDegrees - outfieldFacing) % 360
    if (delta > 180) delta = 360 - delta
    if (delta <= 45) windDesc = `${windDisplay(windSpeedMph)} blowing in`
    else if (delta >= 135) windDesc = `${windDisplay(windSpeedMph)} blowing out`
    else windDesc = `${windDisplay(windSpeedMph)} crosswind`
  } else if (!isControlled && windSpeedMph > 0) {
    windDesc = `${windDisplay(windSpeedMph)} — light`
  }

  const envFactors: FactorBadge[] = isControlled
    ? [
        badge('Park', parkM, parkDesc),
        badge('Weather', 1.0, 'dome / roof — weather neutral'),
      ]
    : [
        badge('Park', parkM, parkDesc),
        badge('Temp', tempM, tempDesc),
        badge('Wind', windM, windDesc),
      ]

  return {
    homeBats: {
      pitcherFactors: pitcherFactors(awayPitcher),
      lineupFactors: lineupFactors(homeOBP, topOfOrderOBP.home),
      envFactors,
      lambda: game.lambda.home,
    },
    awayBats: {
      pitcherFactors: pitcherFactors(homePitcher),
      lineupFactors: lineupFactors(awayOBP, topOfOrderOBP.away),
      envFactors,
      lambda: game.lambda.away,
    },
  }
}
