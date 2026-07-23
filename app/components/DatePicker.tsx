'use client'

import { useSettings } from '@/app/context/SettingsContext'
import { MODE_ACCENT } from '@/lib/mode'

interface DatePickerProps {
  date: string        // YYYY-MM-DD
  onChange: (date: string) => void
}

function getPacificToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date())
}

export default function DatePicker({ date, onChange }: DatePickerProps) {
  const { settings } = useSettings()
  const today = getPacificToday()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]
  const buttonClass =
    'min-h-10 flex-1 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 sm:min-h-0 sm:flex-none sm:px-4 sm:py-1.5 border'

  return (
    <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
      {[today, tomorrowStr].map(d => {
        const isActive = date === d
        return (
          <button
            key={d}
            onClick={() => onChange(d)}
            className={`${buttonClass} ${
              isActive
                ? MODE_ACCENT[settings.mode].solid
                : 'border-slate-700/50 bg-slate-800/40 text-slate-300 backdrop-blur-sm hover:border-slate-500/50 hover:bg-slate-700/40 hover:text-slate-100'
            }`}
          >
            {d === today ? 'Today' : 'Tomorrow'}
          </button>
        )
      })}
    </div>
  )
}