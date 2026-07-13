// Which engine's probability ships as the site's headline number.
// Decided by `npm run backtest -- <start> <end> --compare-sim` (Brier score,
// calibration gap as tiebreak) — see README "Model" section for the numbers.
export type HeadlineModel = 'poisson' | 'sim' | 'blend'

// Backtest results (2026-03-26 → 2026-07-05, 1,344 games):
//   Poisson (1st-inning stats + recalibrated BASE_LAMBDA)  Brier ~0.2460  calGap ~0%
//   Blend Poisson+SimFixed (current)                       Brier 0.2447  calGap +1.2%   ← winner
//   Sim fixed (no streaks)                                 Brier 0.2463  calGap +3.5%
//   Sim + streak factors                                   Brier 0.2538  calGap +7.8%   (streaks hurt)
//   Faithful as-coded                                      Brier 0.2577  calGap −10.3%
//
// The blend remains the headline model because it yields the lowest Brier score.
// The Poisson engine now uses 1st‑inning‑specific stats for pitchers (FIP, K%, BB%)
// and batters (OBP) with fallback to league averages when sample size is small.
// BASE_LAMBDA was recalibrated to match the 2026 YRFI base rate (51.8% → λ = 0.366).
export const HEADLINE_MODEL: HeadlineModel = 'blend'

// Streak multipliers hurt calibration in the backtest — keep off.
export const SIM_USE_STREAKS = false