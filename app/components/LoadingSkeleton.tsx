'use client'

import { useEffect, useState } from 'react'

export default function LoadingSkeleton() {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-4 text-sm text-slate-500">Loading games… {elapsed}s</div>
      <div className="grid gap-3 sm:space-y-0">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100 sm:h-14 sm:rounded-lg" />
        ))}
      </div>
    </div>
  )
}
