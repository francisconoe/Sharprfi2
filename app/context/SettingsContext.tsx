'use client'

import { createContext, useContext, useState } from 'react'
import type { ViewMode } from '@/lib/mode'

export interface Settings {
  mode: ViewMode
  tempUnit: 'F' | 'C'
  windUnit: 'mph' | 'kmh'
  oddsFormat: 'american' | 'decimal'
  timezone: string
}

const DEFAULTS: Settings = {
  mode: 'yrfi',
  tempUnit: 'F',
  windUnit: 'mph',
  oddsFormat: 'american',
  timezone: 'auto',
}

export function resolveTimezone(tz: string): string {
  if (tz === 'auto') return Intl.DateTimeFormat().resolvedOptions().timeZone
  return tz
}

const SettingsContext = createContext<{
  settings: Settings
  update: (patch: Partial<Settings>) => void
}>({ settings: DEFAULTS, update: () => {} })

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const stored = localStorage.getItem('sharprfi-settings')
      if (stored) return { ...DEFAULTS, ...JSON.parse(stored) }
    } catch {}
    return DEFAULTS
  })

  function update(patch: Partial<Settings>) {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem('sharprfi-settings', JSON.stringify(next)) } catch {}
      return next
    })
  }

  return (
    <SettingsContext.Provider value={{ settings, update }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}

export const TIMEZONES: { label: string; value: string }[] = [
  { label: 'Device (auto)', value: 'auto' },
  { label: 'Eastern (ET)',   value: 'America/New_York' },
  { label: 'Central (CT)',   value: 'America/Chicago' },
  { label: 'Mountain (MT)',  value: 'America/Denver' },
  { label: 'Pacific (PT)',   value: 'America/Los_Angeles' },
  { label: 'Alaska (AKT)',   value: 'America/Anchorage' },
  { label: 'Hawaii (HST)',   value: 'Pacific/Honolulu' },
  { label: 'London (GMT/BST)', value: 'Europe/London' },
  { label: 'Paris (CET/CEST)', value: 'Europe/Paris' },
  { label: 'Tokyo (JST)',    value: 'Asia/Tokyo' },
  { label: 'Sydney (AEST)',  value: 'Australia/Sydney' },
]
