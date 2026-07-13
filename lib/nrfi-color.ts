// Model output range (BASE_LAMBDA=0.3371, adj 0.55–1.55):
//   min NRFI ≈ 35%  (both offenses strong, hot/wind-out conditions)
//   avg NRFI ≈ 51%  (league-average everything)
//   max NRFI ≈ 69%  (both pitchers elite, cold/wind-in conditions)
//
// Color scale: red (weak bet) → yellow (near average) → green (strong bet)
// Same gradient direction as YRFI: higher probability = greener = bet it.
const MIN_REALISTIC_NRFI = 0.45
const MAX_REALISTIC_NRFI = 0.62

// 9-stop gradient: hsl(0) red → hsl(140) green, uniform hue steps
const NRFI_COLOR_CLASSES = [
  'text-[hsl(0_82%_42%)]',    // deep red   — well below average
  'text-[hsl(17_82%_41%)]',
  'text-[hsl(35_82%_40%)]',   // orange
  'text-[hsl(52_82%_39%)]',
  'text-[hsl(70_82%_38%)]',   // yellow     — near league average (~51%)
  'text-[hsl(87_82%_36%)]',
  'text-[hsl(105_82%_34%)]',
  'text-[hsl(122_82%_33%)]',
  'text-[hsl(140_82%_32%)]',  // deep green — well above average
] as const

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function getNrfiTextClass(probability: number): string {
  const normalized = clamp(
    (probability - MIN_REALISTIC_NRFI) / (MAX_REALISTIC_NRFI - MIN_REALISTIC_NRFI),
    0,
    1,
  )

  const index = Math.round(normalized * (NRFI_COLOR_CLASSES.length - 1))
  return NRFI_COLOR_CLASSES[index]
}
