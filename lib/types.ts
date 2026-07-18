export interface SavantStats {
  playerId: number
  barrelRate: number       // barrel_batted_rate from CSV (0–100 scale)
  hardHitRate: number      // hard_hit_percent from CSV (0–100 scale) — reserved for v2
  inningsPitched: number   // used only for 50 IP qualification check
}

export interface PitcherStats {
  playerId: number
  name: string
  fip: number              // (13×HR + 3×(BB+HBP) − 2×K) / IP + 3.10
  kPct: number             // strikeouts / batters faced (0–1 scale)
  barrelRate: number       // from Savant; league avg fallback if < 50 IP or missing
  hardHitRate: number      // from Savant; league avg fallback
  confirmed: boolean       // false if TBD — league avg stats used
  estimated: boolean       // true if model used fallback inputs because data was missing
}

export interface WeatherData {
  tempF: number
  windSpeedMph: number
  windFromDegrees: number  // direction wind is coming FROM (Open-Meteo convention)
  humidity: number         // 🔥 nueva: humedad relativa en porcentaje (0-100)
  failure: boolean         // true if fetch failed; model factors default to 1.0
  controlled: boolean      // true for roofed/retractable parks where weather is neutralized
}

export interface BatterRow {
  name: string
  battingSlot: number       // 1–5
  obp: number               // raw season OBP
  stabilizedObp: number     // shrinkage-adjusted value used in model
  plateAppearances: number
}

export interface LineupDetails {
  home: BatterRow[]
  away: BatterRow[]
}

export interface GameResult {
  gamePk: number
  gameTime: string         // ISO string
  gameStatus: 'upcoming' | 'inProgress' | 'settled'
  venue: string
  venueId: number
  homePitcher: PitcherStats
  awayPitcher: PitcherStats
  homeTeam: string
  awayTeam: string
  homeTeamId: number
  awayTeamId: number
  homeOBP: number          // season team OBP
  awayOBP: number
  topOfOrderOBP: { home: number | null; away: number | null }
  parkFactor: number
  lambda: { home: number; away: number }
  yrfiProbability: number  // 0–1 — headline probability (engine per modelUsed)
  poissonYrfiProbability: number   // Poisson engine output
  simYrfiProbability: number | null // Monte Carlo sim engine output (null if sim inputs unavailable)
  modelUsed: 'poisson' | 'sim' | 'blend'
  simDetails: {
    home: { pScore: number; expectedRuns: number; expectedHits: number }
    away: { pScore: number; expectedRuns: number; expectedHits: number }
  } | null
  breakEvenOdds: number    // American odds integer (positive or negative)
  lineupConfirmed: boolean // true when both teams' confirmed top-5 batting order is factored in
  lineupDetails: LineupDetails
  weather: WeatherData
  firstInningResult: 'run' | 'no_run' | 'pending'
}

export interface GamesResponse {
  date: string             // YYYY-MM-DD
  games: GameResult[]
  generatedAt: string      // ISO timestamp
}

export interface GamesErrorResponse {
  error: string
  status: number
}

// ================================================================
// NUEVAS INTERFACES PARA ESTADÍSTICAS DEL 1ER INNING
// ================================================================

export interface FirstInningPitcherStats {
  fip: number
  kPercent: number
  bbPercent: number
  innings: number
  battersFaced: number
  era: number
}

export interface FirstInningBatterStats {
  obp: number
  avg: number
  woba: number
  pa: number
  hits: number
  doubles: number
  triples: number
  homeRuns: number
  walks: number
  hitByPitch: number
}