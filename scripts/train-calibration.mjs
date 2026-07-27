// scripts/train-calibration.mjs
import { readFile, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = path.join(__dirname, '..', '.backtest-cache', 'v4')

// Buscar la carpeta de backtest más reciente
async function findLatestCacheFolder() {
  const folders = await readdir(CACHE_DIR)
  const simFolders = folders.filter(f => f.includes('compare-sim'))
  if (simFolders.length === 0) throw new Error('No se encontraron carpetas de backtest')
  const sorted = simFolders.sort((a, b) => {
    const dateA = a.split('_')[0]
    const dateB = b.split('_')[0]
    return dateB.localeCompare(dateA)
  })
  return sorted[0]
}

// Función de costo logística (log-loss)
function logisticLoss(a, b, preds, actuals) {
  let loss = 0
  for (let i = 0; i < preds.length; i++) {
    const logit = a * preds[i] + b
    const prob = 1 / (1 + Math.exp(-logit))
    loss += -actuals[i] * Math.log(Math.min(Math.max(prob, 1e-10), 1 - 1e-10)) -
            (1 - actuals[i]) * Math.log(Math.min(Math.max(1 - prob, 1e-10), 1 - 1e-10))
  }
  return loss / preds.length
}

// Entrenar regresión logística con gradiente descendente simple
function trainLogisticRegression(preds, actuals, learningRate = 0.1, epochs = 5000) {
  let a = 0.8   // inicialización (cerca de valor esperado)
  let b = 0.0

  for (let epoch = 0; epoch < epochs; epoch++) {
    let gradA = 0, gradB = 0
    for (let i = 0; i < preds.length; i++) {
      const logit = a * preds[i] + b
      const prob = 1 / (1 + Math.exp(-logit))
      const error = prob - actuals[i]
      gradA += error * preds[i]
      gradB += error
    }
    gradA /= preds.length
    gradB /= preds.length

    a -= learningRate * gradA
    b -= learningRate * gradB

    // Early stopping si el cambio es muy pequeño (opcional)
    if (epoch > 100 && Math.abs(gradA) < 1e-6 && Math.abs(gradB) < 1e-6) break
  }

  return { a, b }
}

async function main() {
  console.log('📂 Buscando backtest para entrenar calibración...')
  const folder = await findLatestCacheFolder()
  const folderPath = path.join(CACHE_DIR, folder)
  console.log(`📂 Usando: ${folderPath}`)

  const files = await readdir(folderPath)
  const jsonFiles = files.filter(f => f.endsWith('.json'))

  let preds = []
  let actuals = []

  for (const file of jsonFiles) {
    const filePath = path.join(folderPath, file)
    const raw = await readFile(filePath, 'utf8')
    const data = JSON.parse(raw)

    let rows = []
    if (Array.isArray(data)) rows = data
    else if (data.predictions) rows = data.predictions
    else {
      for (const key of Object.keys(data)) {
        if (Array.isArray(data[key]) && data[key][0]?.prediction !== undefined) {
          rows = data[key]
          break
        }
      }
    }

    for (const row of rows) {
      if (row.prediction !== undefined && row.actual !== undefined) {
        // Usamos la predicción del blend (que ya es la final)
        preds.push(row.prediction)
        actuals.push(row.actual)
      }
    }
  }

  if (preds.length < 100) {
    console.error('❌ Datos insuficientes para entrenar calibración.')
    process.exit(1)
  }

  console.log(`📊 Entrenando con ${preds.length} juegos...`)

  // Entrenar regresión logística
  const { a, b } = trainLogisticRegression(preds, actuals)

  console.log(`✅ Coeficientes: a=${a.toFixed(4)}, b=${b.toFixed(4)}`)

  // Guardar en lib/calibration.json
  const calibPath = path.join(__dirname, '..', 'lib', 'calibration.json')
  await writeFile(calibPath, JSON.stringify({ a, b, trainedOn: new Date().toISOString(), n: preds.length }, null, 2))
  console.log(`✅ Calibración guardada en ${calibPath}`)

  // Calcular Brier antes y después de calibrar (solo para ver la mejora)
  const brierBefore = preds.reduce((sum, p, i) => sum + (p - actuals[i]) ** 2, 0) / preds.length
  const calibrated = preds.map(p => 1 / (1 + Math.exp(-(a * Math.log(p / (1 - p)) + b))))
  const brierAfter = calibrated.reduce((sum, p, i) => sum + (p - actuals[i]) ** 2, 0) / preds.length
  console.log(`📊 Brier antes: ${brierBefore.toFixed(4)}`)
  console.log(`📊 Brier después: ${brierAfter.toFixed(4)}`)
  console.log(`📊 Mejora: ${((brierBefore - brierAfter) * 100).toFixed(2)}%`)
}

main().catch(console.error)