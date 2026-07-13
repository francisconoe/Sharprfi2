// Model output range (BASE_LAMBDA=0.3371, adj 0.55–1.55):
//   min YRFI ≈ 31%  (both pitchers elite, cold/wind-in conditions)
//   avg YRFI ≈ 49%  (league-average everything)
//   max YRFI ≈ 65%  (both pitchers weak, hot/wind-out conditions)
//
// Color scale: red (weak bet) → yellow (near average) → green (strong bet)
// Same gradient direction as NRFI: higher probability = greener = bet it.
const MIN_REALISTIC_YRFI = 0.44
const MAX_REALISTIC_YRFI = 0.60

// 9-stop gradient: hsl(0) red → hsl(140) green, uniform hue steps
const YRFI_COLOR_CLASSES = [
  'text-[hsl(0_82%_42%)]',    // deep red   — well below average
  'text-[hsl(17_82%_41%)]',
  'text-[hsl(35_82%_40%)]',   // orange
  'text-[hsl(52_82%_39%)]',
  'text-[hsl(70_82%_38%)]',   // yellow     — near league average (~49%)
  'text-[hsl(87_82%_36%)]',
  'text-[hsl(105_82%_34%)]',
  'text-[hsl(122_82%_33%)]',
  'text-[hsl(140_82%_32%)]',  // deep green — well above average
] as const

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function getYrfiTextClass(probability: number): string {
  const normalized = clamp(
    (probability - MIN_REALISTIC_YRFI) / (MAX_REALISTIC_YRFI - MIN_REALISTIC_YRFI),
    0,
    1,
  )

  const index = Math.round(normalized * (YRFI_COLOR_CLASSES.length - 1))
  return YRFI_COLOR_CLASSES[index]
}
