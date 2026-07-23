// scripts/generate-history.mjs
import { readFile, writeFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = path.join(__dirname, '..', '.backtest-cache', 'v4')

/**
 * Encuentra la carpeta de backtest más reciente.
 * Primero ordena por fecha de inicio y fin (extraídas del nombre),
 * y si hay empate, usa la fecha de modificación del sistema de archivos.
 */
async function findLatestCacheFolder() {
  const folders = await readdir(CACHE_DIR)
  const simFolders = folders.filter(f => f.includes('compare-sim'))
  if (simFolders.length === 0) throw new Error('No se encontraron carpetas de backtest')

  // Ordenar: primero por fecha de inicio (más reciente primero), luego por fecha de fin, y finalmente por mtime
  const sorted = await Promise.all(
    simFolders.map(async (folder) => {
      const parts = folder.split('_')
      const startDate = parts[0] || '1900-01-01'
      const endDate = parts[1] || '1900-01-01'
      const stats = await stat(path.join(CACHE_DIR, folder))
      return { folder, startDate, endDate, mtime: stats.mtime }
    })
  )

  sorted.sort((a, b) => {
    // Primero por fecha de inicio (descendente)
    if (a.startDate !== b.startDate) return b.startDate.localeCompare(a.startDate)
    // Luego por fecha de fin (descendente)
    if (a.endDate !== b.endDate) return b.endDate.localeCompare(a.endDate)
    // Finalmente por fecha de modificación (descendente)
    return b.mtime.getTime() - a.mtime.getTime()
  })

  return sorted[0].folder
}

async function main() {
  console.log('📂 Buscando carpeta de backtest más reciente...')
  const folder = await findLatestCacheFolder()
  const folderPath = path.join(CACHE_DIR, folder)
  console.log(`📂 Usando: ${folderPath}`)

  const files = await readdir(folderPath)
  const jsonFiles = files.filter(f => f.endsWith('.json'))

  if (jsonFiles.length === 0) {
    console.error('❌ No se encontraron archivos JSON en la carpeta.')
    process.exit(1)
  }

  console.log(`📄 Procesando ${jsonFiles.length} archivos...`)
  const history = []

  for (const file of jsonFiles) {
    const filePath = path.join(folderPath, file)
    const raw = await readFile(filePath, 'utf8')
    const data = JSON.parse(raw)

    // Extraer el array de predicciones
    let rows = []
    if (Array.isArray(data)) {
      rows = data
    } else if (data.predictions && Array.isArray(data.predictions)) {
      rows = data.predictions
    } else {
      // Buscar cualquier array en el objeto
      for (const key of Object.keys(data)) {
        if (Array.isArray(data[key]) && data[key].length > 0 && data[key][0].prediction !== undefined) {
          rows = data[key]
          break
        }
      }
    }

    if (rows.length === 0) continue

    const total = rows.length
    const correct = rows.filter(r => {
      const pred = r.prediction
      const actual = r.actual
      return (pred >= 0.5 && actual === 1) || (pred < 0.5 && actual === 0)
    }).length

    const accuracy = (correct / total) * 100
    const brier = rows.reduce((sum, r) => sum + (r.prediction - r.actual) ** 2, 0) / total

    // Fecha del archivo
    const date = file.replace('.json', '')

    history.push({
      date,
      total,
      correct,
      accuracy: Math.round(accuracy * 10) / 10, // 1 decimal
      brier: Math.round(brier * 10000) / 10000, // 4 decimales
    })
  }

  // Ordenar por fecha (más reciente primero)
  history.sort((a, b) => b.date.localeCompare(a.date))

  // Guardar en public/history.json
  const outputPath = path.join(__dirname, '..', 'public', 'history.json')
  await writeFile(outputPath, JSON.stringify(history, null, 2))
  console.log(`✅ Historial guardado en ${outputPath} (${history.length} días)`)

  if (history.length > 0) {
    const latest = history[0]
    console.log(`📊 Último día: ${latest.date} | Efectividad: ${latest.accuracy.toFixed(1)}% | Brier: ${latest.brier.toFixed(4)}`)
  }
}

main().catch(error => {
  console.error('❌ Error:', error.message)
  process.exit(1)
})