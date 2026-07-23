// app/history/page.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface HistoryEntry {
  date: string
  total: number
  correct: number
  accuracy: number
  brier: number
}

export default function HistoryPage() {
  const [data, setData] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/history.json')
      .then(res => {
        if (!res.ok) throw new Error('No se pudo cargar el historial')
        return res.json()
      })
      .then(json => {
        setData(json)
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-400 border-t-transparent" />
        <p className="text-slate-400 mt-4">Cargando historial...</p>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-50 mb-4">📊 Historial</h1>
        <p className="text-slate-400">
          No hay datos de historial disponibles. Ejecuta <code className="bg-slate-800 px-2 py-1 rounded text-xs">npm run generate-history</code> para generarlo.
        </p>
      </div>
    )
  }

  const totalGames = data.reduce((sum, d) => sum + d.total, 0)
  const totalCorrect = data.reduce((sum, d) => sum + d.correct, 0)
  const overallAccuracy = (totalCorrect / totalGames) * 100
  const avgBrier = data.reduce((sum, d) => sum + d.brier * d.total, 0) / totalGames

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">📊 Historial de resultados</h1>
          <p className="text-slate-400 text-sm mt-1">
            Efectividad del modelo en días anteriores (basado en backtest)
          </p>
        </div>
        <Link
          href="/"
          className="text-slate-400 hover:text-slate-200 transition-colors text-sm flex items-center gap-1"
        >
          ← Volver
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4 backdrop-blur-sm text-center">
          <div className="text-2xl font-bold text-slate-50">{totalGames}</div>
          <div className="text-xs text-slate-400">Juegos totales</div>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4 backdrop-blur-sm text-center">
          <div className="text-2xl font-bold text-emerald-400">{totalCorrect}</div>
          <div className="text-xs text-slate-400">Aciertos</div>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4 backdrop-blur-sm text-center">
          <div className={`text-2xl font-bold ${overallAccuracy >= 55 ? 'text-emerald-400' : overallAccuracy >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
            {overallAccuracy.toFixed(1)}%
          </div>
          <div className="text-xs text-slate-400">Efectividad global</div>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4 backdrop-blur-sm text-center">
          <div className="text-2xl font-bold text-slate-50">{avgBrier.toFixed(4)}</div>
          <div className="text-xs text-slate-400">Brier promedio</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-800/40 backdrop-blur-sm shadow-lg">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/50 border-b border-slate-700/50">
            <tr>
              <th className="px-4 py-3 text-left text-slate-300 font-semibold">Fecha</th>
              <th className="px-4 py-3 text-center text-slate-300 font-semibold">Juegos</th>
              <th className="px-4 py-3 text-center text-slate-300 font-semibold">Aciertos</th>
              <th className="px-4 py-3 text-center text-slate-300 font-semibold">Efectividad</th>
              <th className="px-4 py-3 text-center text-slate-300 font-semibold">Brier</th>
            </tr>
          </thead>
          <tbody>
            {data.map((entry) => (
              <tr key={entry.date} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                <td className="px-4 py-3 text-slate-200 font-mono">{entry.date}</td>
                <td className="px-4 py-3 text-center text-slate-300">{entry.total}</td>
                <td className="px-4 py-3 text-center text-slate-300">{entry.correct}</td>
                <td className="px-4 py-3 text-center font-bold">
                  <span className={entry.accuracy >= 55 ? 'text-emerald-400' : entry.accuracy >= 50 ? 'text-amber-400' : 'text-rose-400'}>
                    {entry.accuracy.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-slate-300 font-mono">{entry.brier.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-slate-500 text-xs mt-4 text-center">
        Historial generado a partir del backtest más reciente. Ejecuta <code className="bg-slate-800 px-2 py-0.5 rounded text-xs">npm run generate-history</code> para actualizar.
      </p>
    </div>
  )
}