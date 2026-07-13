// analyze-by-day.js
const fs = require('fs');
const path = require('path');

// Ruta de la carpeta con los archivos JSON diarios
const folder = '.backtest-cache/v4/2026-03-26_2026-07-05_compare-sim';

console.log(`📂 Leyendo archivos desde: ${folder}`);

if (!fs.existsSync(folder)) {
  console.error('❌ La carpeta no existe.');
  process.exit(1);
}

// Obtener todos los archivos .json
const files = fs.readdirSync(folder).filter(f => f.endsWith('.json'));
console.log(`📄 Encontrados ${files.length} archivos JSON.`);

// Leer y combinar todos los juegos
let allGames = [];
for (const file of files) {
  const filePath = path.join(folder, file);
  const raw = fs.readFileSync(filePath, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.warn(`⚠️ Error al parsear ${file}, saltando.`);
    continue;
  }

  // Los datos pueden ser un array de juegos o un objeto con campo 'games'
  const games = Array.isArray(data) ? data : (data.games || []);
  if (games.length > 0) {
    allGames = allGames.concat(games);
  }
}

console.log(`✅ Total de juegos: ${allGames.length}`);

// Agrupar por día de la semana
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const byDay = {};
DAYS.forEach(d => byDay[d] = { games: [], preds: [], actuals: [] });

for (const game of allGames) {
  // Obtener la fecha del juego
  const dateStr = game.gameTime || game.gameDate;
  if (!dateStr) continue;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) continue;

  // getUTCDay(): 0=Sunday, 6=Saturday
  let dayIndex = date.getUTCDay();
  if (dayIndex === 0) dayIndex = 6;  // Sunday -> 6 (para que Monday sea 0)
  else dayIndex = dayIndex - 1;       // Monday=1 -> 0, Tuesday=2 -> 1, etc.
  const dayName = DAYS[dayIndex];
  if (!dayName) continue;

  // Probabilidad predecida (usamos yrfiProbability, que es el blend)
  const prob = game.yrfiProbability !== undefined ? game.yrfiProbability : game.probability;
  if (prob === undefined) continue;

  // Resultado real
  let actual = 0;
  if (game.firstInningResult === 'run') actual = 1;
  else if (game.firstInningResult === 'no_run') actual = 0;
  else if (game.actualYRFI !== undefined) actual = game.actualYRFI;
  else continue;

  byDay[dayName].games.push(game);
  byDay[dayName].preds.push(prob);
  byDay[dayName].actuals.push(actual);
}

// Mostrar resultados
console.log('\n📊 Rendimiento por día de la semana (Blend Poisson+SimFixed):');
console.log('----------------------------------------------------------------');
console.log(' Día        | Juegos |   Brier | calGap | Pred% | Real%');
console.log('------------|--------|---------|--------|-------|-------');
let totalGames = 0;
let totalBrier = 0;
for (const day of DAYS) {
  const d = byDay[day];
  const n = d.games.length;
  if (n === 0) continue;
  totalGames += n;

  const avgPred = d.preds.reduce((a, b) => a + b, 0) / n;
  const actualRate = d.actuals.reduce((a, b) => a + b, 0) / n;
  const brier = d.preds.reduce((acc, p, i) => acc + Math.pow(p - d.actuals[i], 2), 0) / n;
  const calGap = avgPred - actualRate;

  totalBrier += brier * n;

  const dayPad = day.padEnd(10);
  console.log(` ${dayPad} | ${String(n).padStart(6)} | ${brier.toFixed(4)} | ${(calGap*100).toFixed(1)}%  | ${(avgPred*100).toFixed(1)}% | ${(actualRate*100).toFixed(1)}%`);
}
console.log('------------|--------|---------|--------|-------|-------');
console.log(` TOTAL      | ${String(totalGames).padStart(6)} | ${(totalBrier/totalGames).toFixed(4)} |   -    |   -   |   -`);

// Mejor y peor día
let bestDay = null, bestBrier = Infinity;
let worstDay = null, worstBrier = -Infinity;
for (const day of DAYS) {
  const d = byDay[day];
  if (d.games.length === 0) continue;
  const brier = d.preds.reduce((acc, p, i) => acc + Math.pow(p - d.actuals[i], 2), 0) / d.games.length;
  if (brier < bestBrier) { bestBrier = brier; bestDay = day; }
  if (brier > worstBrier) { worstBrier = brier; worstDay = day; }
}

if (bestDay) {
  console.log(`\n🏆 Mejor día: ${bestDay} (Brier=${bestBrier.toFixed(4)})`);
  console.log(`⚠️  Peor día:  ${worstDay} (Brier=${worstBrier.toFixed(4)})`);
  const diff = (worstBrier - bestBrier) * 10000;
  console.log(`📊 Diferencia: ${diff.toFixed(1)} puntos base (${(diff/100).toFixed(1)}%)`);
}