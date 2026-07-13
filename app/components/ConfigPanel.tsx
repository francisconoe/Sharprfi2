'use client'

import { useEffect, useRef, useState } from 'react'
import { useSettings, TIMEZONES } from '@/app/context/SettingsContext'
import { MODE_ACCENT } from '@/lib/mode'

const triggerClass = 'min-h-10 w-full rounded-full px-4 py-2 text-sm font-medium transition-colors sm:min-h-0 sm:w-auto sm:px-4 sm:py-1.5'

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function SegmentRow({
  label,
  options,
  value,
  activeClass,
  onChange,
}: {
  label: string
  options: { label: string; value: string }[]
  value: string
  activeClass: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium text-slate-500">{label}</span>
      <div className="flex w-full overflow-hidden rounded-lg border border-slate-200 text-xs font-medium">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 whitespace-nowrap px-3 py-2 transition-colors ${
              value === opt.value
                ? activeClass
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function ConfigPanel() {
  const { settings, update } = useSettings()
  const accent = MODE_ACCENT[settings.mode]
  const [open, setOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function syncIsMobile() {
      setIsMobile(window.innerWidth < 640)
    }

    syncIsMobile()
    window.addEventListener('resize', syncIsMobile)

    return () => window.removeEventListener('resize', syncIsMobile)
  }, [])

  useEffect(() => {
    if (!open) return

    document.body.style.overflow = 'hidden'

    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center justify-center gap-2 ${triggerClass} ${
          open
            ? accent.solid
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
        }`}
        aria-label="Preferences"
        aria-haspopup="dialog"
      >
        <GearIcon />
        <span className="sm:hidden">Preferences</span>
        <span className="hidden sm:inline">Preferences</span>
      </button>

      {open && (
        <div className={isMobile ? 'fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4' : 'absolute right-0 top-full z-50 mt-2'}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Preferences"
            className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg sm:w-64"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Preferences</p>
              {isMobile && (
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-200"
                >
                  Close
                </button>
              )}
            </div>

            <SegmentRow
              label="Temperature"
              options={[{ label: '°F', value: 'F' }, { label: '°C', value: 'C' }]}
              value={settings.tempUnit}
              activeClass={accent.solid}
              onChange={v => update({ tempUnit: v as 'F' | 'C' })}
            />

            <SegmentRow
              label="Wind speed"
              options={[{ label: 'mph', value: 'mph' }, { label: 'km/h', value: 'kmh' }]}
              value={settings.windUnit}
              activeClass={accent.solid}
              onChange={v => update({ windUnit: v as 'mph' | 'kmh' })}
            />

            <SegmentRow
              label="Odds format"
              options={[{ label: 'American', value: 'american' }, { label: 'Decimal', value: 'decimal' }]}
              value={settings.oddsFormat}
              activeClass={accent.solid}
              onChange={v => update({ oddsFormat: v as 'american' | 'decimal' })}
            />

            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-slate-500">Time zone</span>
              <select
                aria-label="Time zone"
                value={settings.timezone}
                onChange={e => update({ timezone: e.target.value })}
                className={`w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 ${accent.ring}`}
              >
                {TIMEZONES.map(tz => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
