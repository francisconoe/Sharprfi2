'use client'

import { BlockMath, InlineMath } from 'react-katex'
import { useSettings } from '@/app/context/SettingsContext'
import type { ViewMode } from '@/lib/mode'

const lambdaMath = String.raw`\begin{aligned}
\lambda &= 0.3371 \times A_{\text{bounded}} \\
A_{\text{raw}} &= F_{\text{FIP}} \times F_{K} \times F_{\text{barrel}} \times F_{\text{OBP}} \\
&\quad \times F_{\text{top5}} \times F_{\text{park}} \times F_{\text{weather}} \\
A_{\text{bounded}} &= \operatorname{clamp}(A_{\text{raw}}, 0.55, 1.55)
\end{aligned}`

const yrfiMath = String.raw`\begin{aligned}
P(\mathrm{YRFI}) &= 1 - P(H=0)\,P(A=0) \\
&= 1 - e^{-\lambda_H} e^{-\lambda_A} \\
&= 1 - e^{-(\lambda_H + \lambda_A)}
\end{aligned}`

const nrfiMath = String.raw`\begin{aligned}
P(\mathrm{NRFI}) &= P(H=0)\,P(A=0) \\
&= e^{-\lambda_H} \cdot e^{-\lambda_A} \\
&= e^{-(\lambda_H + \lambda_A)}
\end{aligned}`

const oddsMath = String.raw`\begin{cases}
-\left\lceil \frac{100p}{1-p} \right\rceil & p \ge 0.5 \\
+\left\lceil \frac{100(1-p)}{p} \right\rceil & p < 0.5
\end{cases}`

const stabilizationMath = String.raw`\begin{aligned}
s_{\text{effective}} &= s_{0}\,m(d) \\
m(d) &= 1.75 - 0.75\,p(d) \\
p(d) &= \operatorname{clamp}\!\left(\dfrac{d-\text{Mar 15}}{\text{Jul 1}-\text{Mar 15}},\ 0,\ 1\right)
\end{aligned}`

interface ModeCopy {
  accentText: string
  introBody: React.ReactNode
  whyTitle: string
  whyIntro: string
  whyCards: ReadonlyArray<{ title: string; body: string }>
  whyFootnote: string
  baselineSplit: React.ReactNode
  indicatorLabel: string
  step2Title: string
  step2Trigger: React.ReactNode
  probMath: string
  step2Note: React.ReactNode
  step3Lead: string
}

const MODE_COPY: Record<ViewMode, ModeCopy> = {
  yrfi: {
    accentText: 'text-green-700',
    introBody: (
      <>
        blended with a batter-level Monte Carlo simulation
        to estimate the likelihood that at least one run
        scores in the first inning of each game. Each half-inning is modeled independently,
        then combined. The output is the minimum American odds at which a YRFI bet has positive expected value.
      </>
    ),
    whyTitle: 'Why YRFI?',
    whyIntro: 'The starting point for this project is simple: books often shade extra vig into NRFI because it is the cleaner, more popular public bet. A scoreless first inning feels intuitive, casual bettors gravitate to it, and that demand can make the opposite side more interesting than it looks at first glance.',
    whyCards: [
      {
        title: 'Public bias',
        body: 'NRFI is a heavily favored public betting angle because rooting for no runs feels safer than betting on instant offense. That popularity gives sportsbooks room to price NRFI aggressively.',
      },
      {
        title: 'Pricing effect',
        body: 'When books lean into that demand, YRFI can become the less fashionable side with the more interesting price. The edge is not that YRFI wins more often, it is that the offered odds can be better than the true probability implies.',
      },
      {
        title: 'Model goal',
        body: 'This model exists to estimate fair YRFI probability first, then convert that into a break-even American price. If the market offers a better number than that threshold, the bet is theoretically +EV.',
      },
    ],
    whyFootnote: 'That does not mean every YRFI is good or that every NRFI is bad. It means the question is about price, not just outcome. The methodology below is built to answer that pricing question in a consistent way.',
    baselineSplit: (
      <>
        from 2023 through 2025: <InlineMath math="3575 / 7290 \approx 49.05\%" /> YRFI and <InlineMath math="50.95\%" /> NRFI.
      </>
    ),
    indicatorLabel: 'YRFI',
    step2Title: 'Engine 1: Poisson — Step 2 — Compute P(YRFI) from both λ values',
    step2Trigger: (
      <>
        YRFI hits when <em>either</em> team scores, so:
      </>
    ),
    probMath: yrfiMath,
    step2Note: (
      <>
        This assumes independence between the two half-innings, which is a reasonable approximation
        since different batters face different pitchers. At league-average inputs both half-innings have
        <InlineMath math={String.raw`\lambda = 0.3371`} />, which gives <InlineMath math={String.raw`P(\mathrm{YRFI}) = 1 - e^{-0.6742} \approx 49.05\%`} />.
      </>
    ),
    step3Lead: 'The headline YRFI probability is the simple average of the two engines. The "Bet at" column then shows the worst odds at which a YRFI bet still has positive expected value at that blended probability. If the sportsbook offers better odds than this, the bet is +EV.',
  },
  nrfi: {
    accentText: 'text-red-700',
    introBody: (
      <>
        blended with a batter-level Monte Carlo simulation
        to estimate the likelihood that neither team scores
        across the six outs of the first inning. Each half-inning is modeled independently using
        starter quality, offense, park, and weather inputs, then combined. The output is the minimum
        American odds at which an NRFI bet has positive expected value.
      </>
    ),
    whyTitle: 'Why NRFI?',
    whyIntro: 'NRFI wins when both starters retire the side without giving up a run — six total outs, no damage done. That outcome is genuinely more likely in some games than others, and starter quality is the single biggest driver. The model exists to quantify exactly how much more (or less) likely it is for each matchup.',
    whyCards: [
      {
        title: 'Starter quality',
        body: 'The first inning belongs almost entirely to the starting pitcher. Elite starters with low FIP, high strikeout rates, and strong Statcast contact metrics genuinely suppress first-inning scoring — that signal is real and measurable.',
      },
      {
        title: 'Context matters',
        body: 'Park, weather, and lineup order all shift the baseline. A pitcher-friendly park with wind blowing in on a cold night looks very different from Coors Field on a warm afternoon — the model accounts for all of it.',
      },
      {
        title: 'Model goal',
        body: 'This model estimates a fair NRFI probability for each game, then converts that into a break-even American price. If the sportsbook is offering better odds than the break-even, the bet is theoretically +EV.',
      },
    ],
    whyFootnote: 'NRFI at league average hits roughly 50.95% of the time — it is a slight favorite by default. The cases worth betting are the ones where two quality starters push that number meaningfully higher and the market price reflects less than it should.',
    baselineSplit: (
      <>
        from 2023 through 2025: <InlineMath math="3715 / 7290 \approx 50.95\%" /> NRFI and <InlineMath math="49.05\%" /> YRFI.
      </>
    ),
    indicatorLabel: 'NRFI',
    step2Title: 'Engine 1: Poisson — Step 2 — Compute P(NRFI) from both λ values',
    step2Trigger: (
      <>
        NRFI hits when <em>neither</em> team scores, so both half-innings must be scoreless:
      </>
    ),
    probMath: nrfiMath,
    step2Note: (
      <>
        This assumes independence between the two half-innings, which is a reasonable approximation
        since different batters face different pitchers. At league-average inputs both half-innings have
        <InlineMath math={String.raw`\lambda = 0.3371`} />, which gives <InlineMath math={String.raw`P(\mathrm{NRFI}) = e^{-0.6742} \approx 50.95\%`} />.
        This is verified against the 2023–2025 backtested rate of <InlineMath math={String.raw`3715 / 7290 \approx 50.95\%`} /> NRFI.
      </>
    ),
    step3Lead: 'The headline NRFI probability is the simple average of the two engines. The "Bet at" column then shows the worst odds at which an NRFI bet still has positive expected value at that blended probability. If the sportsbook offers better odds than this, the bet is +EV.',
  },
}

const factorRows = [
  {
    name: 'FIP factor',
    formula: String.raw`\left(\dfrac{\text{shrunk FIP}}{3.80}\right)^{0.55}`,
    mobileFormula: String.raw`\left(\dfrac{\text{shrunk FIP}}{3.80}\right)^{0.55}`,
    description: 'FIP is the main pitcher input, but it is first shrunk toward league average when innings are limited and then damped so it cannot dominate the whole model by itself.',
    source: 'MLB Stats API',
  },
  {
    name: 'K% factor',
    formula: String.raw`\operatorname{clamp}\!\left(1 + 0.3\,\dfrac{0.23 - \text{shrunk }K\%}{0.23},\ 0.85,\ 1.15\right)`,
    mobileFormula: String.raw`\operatorname{clamp}\!\left(1 + 0.3\,\dfrac{0.23-K\%}{0.23},\ 0.85,\ 1.15\right)`,
    description: 'Strikeout rate is shrunk toward league average by batters faced, then clamped so a single extreme K% cannot swing the estimate by more than ±15%.',
    source: 'MLB Stats API',
  },
  {
    name: 'Barrel factor',
    formula: String.raw`\left(\dfrac{\text{shrunk barrel rate}}{8.0\%}\right)^{0.35}`,
    mobileFormula: String.raw`\left(\dfrac{\text{shrunk barrel rate}}{8.0\%}\right)^{0.35}`,
    description: 'Barrel rate captures contact quality, but it overlaps with FIP, so it is shrunk by innings pitched and applied as a softer secondary adjustment.',
    source: 'Baseball Savant',
  },
  {
    name: 'OBP factor',
    formula: String.raw`\left(\dfrac{\text{shrunk team OBP}}{0.310}\right)^{0.70}`,
    mobileFormula: String.raw`\left(\dfrac{\text{shrunk team OBP}}{0.310}\right)^{0.70}`,
    description: 'Season team OBP still anchors baseline offense, and the stabilization sample is heavier in April and May so tiny samples do not move the model too aggressively.',
    source: 'MLB Stats API',
  },
  {
    name: 'Top-5 lineup factor',
    formula: String.raw`\left(\operatorname{clamp}\!\left(\dfrac{\bar{OBP}_{1\text{-}5,w}}{\text{team OBP}},\ 0.90,\ 1.12\right)\right)^{0.45}`,
    mobileFormula: String.raw`\left(\operatorname{clamp}\!\left(\dfrac{\bar{OBP}_{1\text{-}5,w}}{OBP_\text{team}},\ 0.90,\ 1.12\right)\right)^{0.45}`,
    description: 'When a confirmed lineup is available, the probability-weighted OBP of the first five hitters replaces the old simple top-three average. Batters 1–3 carry full weight (1.00); batter 4 is weighted 0.67 and batter 5 is weighted 0.37, reflecting each one\'s first-inning plate appearance probability derived from the binomial distribution over the league out rate (0.69). If fewer than three hitters are confirmed, this factor stays neutral.',
    source: 'MLB Stats API',
  },
  {
    name: 'Park factor',
    formula: String.raw`\left(\text{park factor}\right)^{0.50}`,
    mobileFormula: String.raw`\left(\text{park factor}\right)^{0.50}`,
    description: 'Park context still matters, but it is damped rather than fully multiplied so the venue informs the number without dictating it.',
    source: 'FanGraphs',
  },
  {
    name: 'Temp factor',
    formula: String.raw`T<55^\circ\!F\to0.92,\ T>80^\circ\!F\to1.06,\ \text{else }1.00`,
    mobileFormula: String.raw`\begin{aligned}
T<55^\circ\!F&\to0.92\\
T>80^\circ\!F&\to1.06,\ \mathrm{else}\to1.00
\end{aligned}`,
    description: 'Cold air suppresses carry and hot air helps it slightly. Fixed-roof and retractable-roof parks are treated as neutral to avoid fake weather edge when roof state is unknown.',
    source: 'Open-Meteo',
  },
  {
    name: 'Wind factor',
    formula: String.raw`\ge10\ \mathrm{mph}:\ \text{in}\to0.93,\ \text{out}\to1.08,\ \text{cross}\to1.00`,
    mobileFormula: String.raw`\begin{aligned}
\ge10\ \mathrm{mph}:\ &\mathrm{in}\to0.93,\ \mathrm{out}\to1.08\\
&\mathrm{cross}\to1.00
\end{aligned}`,
    description: 'Wind direction is resolved relative to each park\'s outfield orientation, then the total weather effect is damped so one forecast input cannot create an unrealistic number.',
    source: 'Open-Meteo',
  },
] as const

const caveats = [
  'The Poisson engine\'s lineup factor covers only the top five hitters (the simulation covers the full order, but hitters 6–9 rarely bat in the first inning anyway)',
  'Bullpen usage or opener strategies',
  'In-game factors like pitch count, injury, or weather changes mid-game',
  'Umpire tendencies or day/night splits',
  'The simulation\'s base advancement is station-to-station — no steals, errors, sacrifices, or wild pitches; a global calibration constant compensates in aggregate but not per matchup',
  'The simulation does not use weather — only the Poisson engine sees temperature and wind',
  'Early-season data is stabilized, but still noisier than midseason',
] as const

export default function MethodologyView() {
  const { settings } = useSettings()
  const copy = MODE_COPY[settings.mode]

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 text-sm text-slate-700 sm:py-8">

      {/* Intro */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-slate-900 mb-2">How the model works</h2>
        <p className="text-slate-500 leading-relaxed">
          {copy.indicatorLabel} uses a{' '}
          <a
            href="https://www.geeksforgeeks.org/maths/poisson-distribution/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-slate-600 underline decoration-slate-300 decoration-1 underline-offset-2 transition-colors hover:text-slate-800 hover:decoration-slate-400"
          >
            Poisson probability model
          </a>{' '}
          {copy.introBody}
        </p>
      </div>

      <Section title={copy.whyTitle}>
        <p className="leading-relaxed text-slate-600">
          {copy.whyIntro}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {copy.whyCards.map(card => (
            <article key={card.title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40">
              <div className={`text-[0.68rem] font-semibold uppercase tracking-[0.16em] ${copy.accentText}`}>{card.title}</div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {card.body}
              </p>
            </article>
          ))}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          {copy.whyFootnote}
        </p>
      </Section>

      {/* Step 1 */}
      <Section title="Engine 1: Poisson — Step 1 — Estimate λ (expected runs) for each half-inning">
        <p className="mb-3 leading-relaxed">
          <InlineMath math={String.raw`\lambda`} /> represents the expected number of runs scored by one team in the first inning.
          The model starts from a baseline of <InlineMath math="0.3371" />{' '}for one team&apos;s half-inning.
          That neutral prior was recalibrated from every completed MLB regular-season game in the pitch-clock era
          {' '}{copy.baselineSplit}
          {' '}The model then adjusts each half-inning baseline with seven stabilized inputs plus a lineup-aware top-of-order
          tweak when a confirmed batting order is posted.
        </p>
        <FormulaBlock math={lambdaMath} align="left" className="mb-6" />

        <FactorTable factors={factorRows} />

        <p className="mt-4 leading-relaxed">
          Early-season shrinkage is date-adjusted rather than fixed. Each base stabilization sample is multiplied by:
        </p>
        <FormulaBlock math={stabilizationMath} align="left" className="mt-3 mb-3" />
        <p className="text-slate-500 text-xs leading-relaxed">
          That means April samples are pulled harder toward league average, and the extra shrinkage fades linearly to neutral by July.
        </p>

        <p className="mt-4 text-slate-500 text-xs leading-relaxed">
          Each team&apos;s <InlineMath math={String.raw`\lambda`} /> uses that team&apos;s OBP and the <em>opposing</em>
          {' '}pitcher&apos;s stats,
          because the home team bats against the away starter, and vice versa. If a confirmed lineup is available,
          the model compares the probability-weighted OBP of that team&apos;s top five hitters against its broader team
          baseline rather than treating every batting order as interchangeable.
          The raw adjustment is then bounded to keep the model in a realistic MLB range, and league-average
          values are only used when the starter identity or a required stat feed is actually missing.
          When both teams&apos; confirmed batting orders are factored in, a small{' '}
          <span className="text-[10px] text-slate-400 font-mono">●</span>
          {' '}appears next to the {copy.indicatorLabel} percentage. No indicator means the number still uses season team OBP as the lineup proxy.
        </p>
      </Section>

      {/* Step 2 */}
      <Section title={copy.step2Title}>
        <p className="mb-3 leading-relaxed">
          Under a Poisson model, the probability of scoring <em>zero</em> runs given expected rate{' '}
          <InlineMath math={String.raw`\lambda`} /> is <InlineMath math={String.raw`e^{-\lambda}`} />. {copy.step2Trigger}
        </p>
        <FormulaBlock math={copy.probMath} className="mb-3" />
        <p className="mt-3 text-slate-500 text-xs leading-relaxed">
          {copy.step2Note}
        </p>
      </Section>

      {/* Engine 2: Monte Carlo sim */}
      <Section title="Engine 2 — batter-level Monte Carlo simulation">
        <p className="mb-3 leading-relaxed">
          The second engine was contributed by <strong>Francisco Nevarez</strong> in July 2026 and
          adapted for this site. For each game it simulates the first inning 10,000 times: every batter in the
          confirmed order gets a reach-base probability from their season{' '}
          <a
            href="https://library.fangraphs.com/offense/woba/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-slate-600 underline decoration-slate-300 decoration-1 underline-offset-2 transition-colors hover:text-slate-800 hover:decoration-slate-400"
          >
            wOBA
          </a>{' '}
          (shrunk toward league average in small samples), adjusted for the platoon matchup against the
          opposing starter&apos;s handedness, the starter&apos;s OBP-allowed relative to league, and the park.
          Walks advance runners only when forced; hits advance them station-to-station with an MLB-average
          hit-type split (65% singles, 20% doubles, 3% triples, 12% home runs). The share of simulated innings
          with at least one run is that half-inning&apos;s scoring probability, and the two half-innings combine
          exactly as in Engine 1.
        </p>
        <p className="text-slate-500 text-xs leading-relaxed">
          The simulation is deterministic per game (a fixed per-game random seed), and a single global
          calibration constant is tuned so league-average inputs reproduce the observed 49.05% YRFI base rate —
          the same neutral-baseline validation Engine 1 went through. Both engines are shown side by side in
          every matchup&apos;s detail panel.
        </p>
      </Section>

      {/* Final step: blend + odds */}
      <Section title="Final step — blend the engines and convert to break-even odds">
        <p className="mb-3 leading-relaxed">
          {copy.step3Lead}
        </p>
        <OddsFormulaBlock math={oddsMath} className="mb-3" />
        <p className="mt-3 text-slate-500 text-xs leading-relaxed">
          The 50/50 blend is not a stylistic choice — it won a 1,344-game 2026 backtest outright
          (Brier 0.2447 vs 0.2476 for Poisson alone and 0.2463 for the simulation alone, calibration gap +1.2%),
          and it spreads predictions meaningfully wider: games it rates 60–70% have hit 66.7%. The contributed
          model&apos;s team-win-streak multipliers were tested in the same backtest and rejected.
          The ceiling function is used instead of rounding so the threshold is always conservative,
          you need odds <em>at least</em> this good, not just approximately this good.
          A <Mono>~</Mono> prefix means one or both probable starters are still TBD, or a named starter still relies on fallback pitcher inputs.
          Odds stay visible unless a probable starter is still TBD. To price a specific bet, every matchup&apos;s
          detail panel includes a &quot;Bet value&quot; calculator: enter your book&apos;s odds to get the implied
          probability, expected value per unit, and a banded verdict.
        </p>
      </Section>

      {/* Caveats */}
      <Section title="What the model doesn&apos;t capture">
        <ul className="space-y-2 text-slate-500 leading-relaxed">
          {caveats.map(caveat => (
            <li key={caveat} className="flex items-start gap-3">
              <span aria-hidden="true" className="mt-[0.55rem] block size-1.5 shrink-0 rounded-full bg-slate-400" />
              <span>{caveat}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Sources */}
      <Section title="Data sources">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { name: 'MLB Stats API', url: 'https://github.com/toddrob99/MLB-StatsAPI', detail: 'Provides schedule data, pitcher season stats (FIP inputs and OBP-allowed), team OBP, per-batter counting stats, and batter/pitcher handedness. Free to use with no key required.' },
            { name: 'Baseball Savant', url: 'https://baseballsavant.mlb.com', detail: 'Provides Statcast barrel rate and hard-hit rate data through free CSV downloads.' },
            { name: 'FanGraphs', url: 'https://www.fangraphs.com/guts.aspx?type=pfh', detail: 'Provides park factors on a 1.00 scale. These values are hardcoded by season and updated annually.' },
            { name: 'Open-Meteo', url: 'https://open-meteo.com', detail: 'Provides hourly temperature, wind speed, and wind direction forecasts. Free to use with no key required.' },
          ].map(s => (
            <a
              key={s.name}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 transition-colors"
            >
              <div className={`font-semibold mb-1 ${copy.accentText}`}>{s.name}</div>
              <div className="text-xs text-slate-500 leading-relaxed">{s.detail}</div>
            </a>
          ))}
        </div>
      </Section>

    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h3 className="text-base font-semibold text-slate-900 mb-3 pb-2 border-b border-slate-100">{title}</h3>
      {children}
    </div>
  )
}

function FormulaBlock({
  math,
  align = 'center',
  className = '',
}: {
  math: string
  align?: 'left' | 'center'
  className?: string
}) {
  return (
    <div className={`methodology-formula methodology-formula--${align} overflow-hidden rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 ${className}`}>
      <BlockMath math={math} />
    </div>
  )
}

function OddsFormulaBlock({ math, className = '' }: { math: string; className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 ${className}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
        <div className="shrink-0 whitespace-nowrap text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:w-28 sm:pt-2">
          Break-even odds
        </div>
        <div className="methodology-formula methodology-formula--left methodology-formula--odds min-w-0 flex-1 overflow-hidden text-slate-800">
          <BlockMath math={math} />
        </div>
      </div>
    </div>
  )
}

function Mono({ children }: { children: React.ReactNode }) {
  return <code className="bg-slate-100 text-slate-700 px-1 py-0.5 rounded text-xs font-mono">{children}</code>
}

function FactorTable({ factors }: {
  factors: ReadonlyArray<{ name: string; formula: string; mobileFormula?: string; description: string; source: string }>
}) {
  return (
    <>
      <div className="space-y-3 sm:hidden">
        {factors.map(f => (
          <article key={f.name} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40">
            <div className="text-sm font-semibold text-slate-800">{f.name}</div>
            <div className="methodology-card-formula mt-2 overflow-hidden rounded-lg bg-slate-50 px-2 py-2 text-slate-700">
              <BlockMath math={f.mobileFormula ?? f.formula} />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">{f.description}</p>
            <div className="mt-3 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-400">{f.source}</div>
          </article>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-slate-200 sm:block">
        <table className="w-full text-xs">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider w-[130px]">Factor</th>
            <th className="px-4 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider w-[260px]">Formula</th>
            <th className="px-4 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider">Rationale</th>
          </tr>
        </thead>
        <tbody>
          {factors.map((f, i) => (
            <tr key={f.name} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
              <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap align-top">{f.name}</td>
              <td className="px-4 py-3 align-top text-slate-600">
                <div className="methodology-inline-formula overflow-hidden">
                  <InlineMath math={f.formula} />
                </div>
              </td>
              <td className="px-4 py-3 text-slate-500 leading-relaxed align-top">{f.description}</td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </>
  )
}
