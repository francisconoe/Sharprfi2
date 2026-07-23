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
        <Link
          href="/"
          className="inline-block mt-6 px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-full transition-colors"
        >
          ← Volver a los juegos
        </Link>
      </div>
    )
  }

  const totalGames = data.reduce((sum, d) => sum + d.total, 0)
  const totalCorrect = data.reduce((sum, d) => sum + d.correct, 0)
  const overallAccuracy = (totalCorrect / totalGames) * 100
  const avgBrier = data.reduce((sum, d) => sum + d.brier * d.total, 0) / totalGames

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* 🔥 Header con botón de volver más visible */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">📊 Historial de resultados</h1>
          <p className="text-slate-400 text-sm mt-1">
            Efectividad del modelo en días anteriores (basado en backtest)
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-full transition-all shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          Volver a juegos
        </Link>
      </div>

      {/* Resumen general */}
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

      {/* Tabla de histórico */}
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