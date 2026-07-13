'use client'

interface StatusBarProps {
  generatedAt: string
  gameCount: number
  onRefresh: () => void
  refreshing: boolean
}

export default function StatusBar({ generatedAt, gameCount, onRefresh, refreshing }: StatusBarProps) {
  const updated = new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-sm text-slate-500 sm:py-2">
      <div className="flex min-w-0 items-center gap-x-3 whitespace-nowrap">
        <span>Updated {updated}</span>
        <span>·</span>
        <span>{gameCount} game{gameCount !== 1 ? 's' : ''}</span>
      </div>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-sm text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-50"
      >
        {refreshing && (
          <svg
            className="size-3.5 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        )}
        <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
      </button>
    </div>
  )
}
