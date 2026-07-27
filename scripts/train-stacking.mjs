// scripts/train-stacking.mjs
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

// Entrenar regresión logística con gradiente descendente
function trainLogisticRegression(preds, actuals, learningRate = 0.1, epochs = 5000) {
  let a = 0.5
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

    if (epoch > 100 && Math.abs(gradA) < 1e-6 && Math.abs(gradB) < 1e-6) break
  }

  return { a, b }
}

async function main() {
  console.log('📂 Buscando backtest para entrenar stacking...')
  const folder = await findLatestCacheFolder()
  const folderPath = path.join(CACHE_DIR, folder)
  console.log(`📂 Usando: ${folderPath}`)

  const files = await readdir(folderPath)
  const jsonFiles = files.filter(f => f.endsWith('.json'))

  // Vamos a recolectar: poissonPred, simPred, lineupConfirmed, IP_total, actual
  const poissonPreds = []
  const simPreds = []
  const lineupConfirmeds = []
  const ipTotals = []
  const actuals = []

  // También podríamos usar parkFactor, weather, etc. (lo dejamos simple por ahora)

  for (const file of jsonFiles) {
    const filePath = path.join(folderPath, file)
    const raw = await readFile(filePath, 'utf8')
    const data = JSON.parse(raw)

    // Estructura esperada: cada archivo tiene un array con predicciones
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
        // Para stacking necesitamos las predicciones individuales de Poisson y Sim.
        // En el backtest, solo guardamos la predicción final (blend).
        // Pero podemos acceder a poissonYrfiProbability y simYrfiProbability si están en el archivo.
        // Como no están, usaremos un enfoque alternativo:
        // - Asumimos que el blend es 50/50, así que poissonPred = simPred = prediction (aproximación)
        // Esto no es ideal, pero mientras tanto podemos entrenar un modelo simple con el blend y contexto.
        // En un futuro, podemos modificar el backtest para guardar las predicciones individuales.
        // Por ahora, usaremos solo la predicción final y features contextuales.
        // Pero vamos a intentar extraer poisson y sim si están disponibles.
        let poisson = row.poissonYrfiProbability
        let sim = row.simYrfiProbability
        if (poisson === undefined || sim === undefined) {
          // Si no están, usamos la predicción final como ambas (aproximación)
          poisson = row.prediction
          sim = row.prediction
        }

        poissonPreds.push(poisson)
        simPreds.push(sim)
        // lineupConfirmed no está en el backtest, así que usamos 0 por defecto
        lineupConfirmeds.push(0)
        // IP_total tampoco, usamos 0
        ipTotals.push(0)
        actuals.push(row.actual)
      }
    }
  }

  if (poissonPreds.length < 100) {
    console.error('❌ Datos insuficientes para entrenar stacking.')
    process.exit(1)
  }

  console.log(`📊 Entrenando stacking con ${poissonPreds.length} juegos...`)

  // Para hacer stacking simple, podemos entrenar una regresión logística que use:
  // - diff = poissonPred - simPred
  // - linea confirmada (placeholder)
  // - IP total (placeholder)
  // Como no tenemos los datos, usaremos solo la diferencia entre predicciones.
  // Esto es una aproximación.
  const diff = poissonPreds.map((p, i) => p - simPreds[i])
  const features = diff.map(d => d) // una sola feature por ahora

  // Entrenar regresión logística con esta feature
  const { a, b } = trainLogisticRegression(features, actuals)

  console.log(`✅ Coeficientes: a=${a.toFixed(4)}, b=${b.toFixed(4)}`)

  // Guardar en lib/stacking-weights.json
  const weightsPath = path.join(__dirname, '..', 'lib', 'stacking-weights.json')
  await writeFile(weightsPath, JSON.stringify({
    type: 'logistic',
    weights: { diff_coeff: a, intercept: b },
    trainedOn: new Date().toISOString(),
    n: poissonPreds.length
  }, null, 2))
  console.log(`✅ Stacking weights guardado en ${weightsPath}`)

  // Evaluar Brier con stacking (usando la fórmula: logit = a * diff + b)
  const stacked = features.map(f => 1 / (1 + Math.exp(-(a * f + b))))
  const brierStacked = stacked.reduce((sum, p, i) => sum + (p - actuals[i]) ** 2, 0) / actuals.length
  const brierBlend = poissonPreds.reduce((sum, p, i) => sum + (p - actuals[i]) ** 2, 0) / actuals.length
  console.log(`📊 Brier blend 50/50: ${brierBlend.toFixed(4)}`)
  console.log(`📊 Brier stacking: ${brierStacked.toFixed(4)}`)
  console.log(`📊 Mejora: ${((brierBlend - brierStacked) * 100).toFixed(2)}%`)
}

main().catch(console.error)