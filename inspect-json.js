const fs = require('fs');
const path = require('path');

const folder = '.backtest-cache/v4/2026-03-26_2026-07-05_compare-sim';
const files = fs.readdirSync(folder).filter(f => f.endsWith('.json'));
if (files.length === 0) {
  console.log('❌ No hay archivos JSON.');
  process.exit(1);
}

const firstFile = files[0];
const filePath = path.join(folder, firstFile);
console.log(`📄 Inspeccionando: ${firstFile}`);

const raw = fs.readFileSync(filePath, 'utf8');
let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error('❌ Error al parsear JSON:', e.message);
  process.exit(1);
}

console.log(`🔍 Tipo de dato raíz: ${Array.isArray(data) ? 'Array' : typeof data}`);
console.log(`🔍 Número de elementos (si es array): ${Array.isArray(data) ? data.length : 'N/A'}`);

if (typeof data === 'object' && data !== null) {
  console.log(`🔍 Claves del objeto: ${Object.keys(data).join(', ')}`);
  // Mostrar el primer elemento si existe una clave que contenga un array
  for (const key of Object.keys(data)) {
    if (Array.isArray(data[key])) {
      console.log(`🔍 La clave "${key}" contiene un array de ${data[key].length} elementos.`);
      if (data[key].length > 0) {
        console.log('🔍 Primer elemento del array:');
        console.log(JSON.stringify(data[key][0], null, 2));
      }
    }
  }
}

// Si es un array, mostrar el primer elemento
if (Array.isArray(data) && data.length > 0) {
  console.log('🔍 Primer elemento del array:');
  console.log(JSON.stringify(data[0], null, 2));
}