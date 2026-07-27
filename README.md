# RenteriaFirstInning Predictor — Modelo de NRFI/YRFI para MLB

**RenteriaFirstInning Predictor** (anteriormente SHARPRFI) es una herramienta independiente que estima la probabilidad de que **NO haya carreras en la primera entrada (NRFI)** o de que **SÍ haya al menos una carrera (YRFI)** en cada partido de la MLB. Está diseñada para apostadores que buscan identificar apuestas con valor esperado positivo (+EV) comparando las probabilidades del modelo con las cuotas ofrecidas por las casas de apuestas.

El modelo combina un **motor Poisson** y una **simulación Monte Carlo**, ambos entrenados y calibrados exclusivamente con estadísticas del **primer inning**. Incluye más de 10 factores ajustados, desde el rendimiento del abridor en la primera entrada hasta variables contextuales como el clima y el platoon.

---

## 🧠 Mejoras clave respecto al modelo original

| Mejora | Descripción |
|--------|-------------|
| **Estadísticas de pitcher en el 1er inning** | FIP, K% y BB% extraídos exclusivamente de los juegos del lanzador filtrados por `inning=1`. |
| **Estadísticas de bateador en el 1er inning** | OBP y wOBA del top-5 calculados solo sobre sus apariciones en el primer turno. |
| **First‑Inning ERA (FIE)** | Factor que corrige el FIP con el ERA específico del lanzador en la primera entrada. |
| **BB/9 (Walk Rate)** | Ajuste por la tasa de bases por bolas en el 1er inning, con shrink hacia la media de liga. |
| **Humedad** | Factor climático que modula el carry de la pelota (días húmedos → menos HR). |
| **Platoon (mano a mano)** | Ajuste del OBP del bateador según la mano del pitcher (zurdo/derecho) usando splits de 1er inning. |
| **wOBA top‑5** | Reemplazo del OBP por wOBA en el factor de orden de bateo, capturando mejor el poder ofensivo. |
| **Recalibrado de `BASE_LAMBDA`** | Ajustado a la tasa real de YRFI de 2026 (51.8%) para eliminar el sesgo histórico. |
| **Clamp más conservador** | Rango de ajuste reducido de `[0.55, 1.55]` a `[0.60, 1.45]` para evitar extremos irreales. |
| **Blend optimizado 70/30** | Más peso al Poisson (70%) frente a la simulación (30%) para mejorar calibración. |
| **Platt Scaling** | Calibración post‑hoc con coeficientes entrenados para corregir la sobreestimación en extremos. |
| **Stacking (opcional)** | Meta‑modelo que aprende pesos dinámicos según el contexto (lineup, IP, etc.). |
| **Historial automático** | Workflow diario en GitHub Actions que actualiza el histórico de resultados a las 8 PM CDMX. |

---

## ⚙️ Cómo funciona el modelo

### Motor Poisson

El modelo parte de una tasa base `λ = 0.350` para cada medio inning (calibrada con los datos de 2026). Luego aplica un **factor de ajuste combinado** que integra:

- **Pitcher** → FIP (1er inning), K%, Barrel Rate, FIE, BB/9  
- **Bateadores** → wOBA/OBP del top-5 (con pesos de participación)  
- **Equipo** → OBP global  
- **Contexto** → Park Factor, Temperatura, Viento, Humedad, Platoon  

El factor se mantiene dentro de un rango conservador (`[0.60, 1.45]`) para que las predicciones no se desvíen de la realidad de la MLB.
λ = 0.350 × A_bounded
A_bounded = clamp(∏ factores, 0.60, 1.45)
P(YRFI) = 1 − e^(−λ_home) × e^(−λ_away)

text

### Simulación Monte Carlo

El segundo motor replica el primer inning **10,000 veces por partido** utilizando:
- wOBA del bateador (con shrink y ajuste por platoon).
- OBP permitido por el lanzador (con shrink).
- Park factor y (opcionalmente) rachas de victorias.
- Avances de corredores con distribución de tipos de hit (65% sencillos, 20% dobles, 3% triples, 12% HR).

### Blend final

La probabilidad final es un **blend 70/30** (Poisson/Simulación), que ha demostrado mejor calibración que el 50/50 original. Además, se aplica **Platt Scaling** para ajustar la confianza en predicciones extremas.

---

## 📊 Resultados de backtest (2026, 1,344 juegos)

| Modelo | Brier | Calibración (gap) |
|--------|-------|-------------------|
| **Blend (Poisson 70% + Sim 30%)** | **0.2445** | +1.2% |
| Poisson (1er inning) | 0.2475 | -1.1% |
| Simulación (sin rachas) | 0.2457 | +3.4% |
| Simulación + rachas | 0.2532 | +7.6% |
| Simulación original (faithful) | 0.2577 | -10.3% |

**Mejor variante:** Blend Poisson+SimFixed (70/30)  
**Calibración por bins (blend):**

| Rango | Juegos | Predicción | Real |
|-------|--------|------------|------|
| 30‑40% | 9 | 38.2% | 44.4% |
| 40‑50% | 391 | 46.7% | 44.0% |
| 50‑60% | 808 | 54.3% | 53.3% |
| 60‑70% | 121 | 63.1% | 63.6% |
| 70‑80% | 15 | 72.1% | 80.0% |

El modelo está bien calibrado en la mayoría de los rangos; la desviación en 70‑80% se debe al pequeño tamaño de muestra (15 juegos).

---

## 🗂️ Estructura del proyecto
app/
api/games/route.ts # Endpoint principal
components/ # UI (React, Tailwind)
context/ # Preferencias del usuario
lib/
mlb-api.ts # Datos de MLB (1er inning, splits)
poisson.ts # Motor Poisson + factores
sim.ts # Simulación Monte Carlo
weather-api.ts # Clima (incluye humedad)
types.ts # Interfaces TypeScript
first-inning-cache.ts # Caché para estadísticas de 1er inning
calibration.json # Coeficientes de Platt Scaling
stacking-weights.json # Pesos del meta‑modelo (opcional)
scripts/
backtest.mjs # Backtest con bins de calibración
generate-history.mjs # Genera el histórico desde el backtest
train-calibration.mjs # Entrena Platt Scaling
train-stacking.mjs # Entrena el meta‑modelo de stacking
.github/
workflows/
update-history.yml # Workflow diario para actualizar el histórico

text

---

## 📦 Instalación y uso

```bash
git clone https://github.com/francisconoe/Sharprfi2.git
cd sharprfi
npm install
npm run dev
Backtest
bash
npm run backtest -- 2026-03-26 2026-07-05 --compare-sim
Generar histórico
bash
npm run generate-history
Entrenar calibración (Platt Scaling)
bash
npm run train-calibration
Entrenar stacking (opcional)
bash
npm run train-stacking
Despliegue en Vercel
bash
npx vercel --prod
🧩 Fuentes de datos
MLB Stats API (gratuita) → schedule, pitchers, lineups, game logs (filtrados por inning=1).

Baseball Savant → barrel rate, hard‑hit rate.

Open‑Meteo → temperatura, viento, humedad.

FanGraphs → park factors (actualizados anualmente).

📝 Notas finales
El modelo usa exclusivamente estadísticas del primer inning para pitchers y bateadores.

Todos los factores tienen shrinkage y clamp para evitar sobreajuste.

El blend 70/30 fue elegido tras múltiples backtests; las rachas de equipo están desactivadas porque empeoran la calibración.

La humedad, FIE, BB/9, wOBA y Platt Scaling han reducido el Brier a 0.2445.

El histórico se actualiza automáticamente cada día a las 8 PM (CDMX) mediante un workflow de GitHub Actions.

🙏 Créditos
Francisco Renteria (aka Francisco Nevarez) – Diseño, desarrollo y optimización del modelo (Poisson, Monte Carlo, factores, calibración, UI y despliegue).

Lucas Reydman – Coautor, arquitectura de la aplicación, integración de datos, automatización del histórico y mejoras en la UI.

Agradecimientos especiales a la comunidad de MLB Stats API, Baseball Savant y Open‑Meteo por proporcionar los datos gratuitamente.

📄 Licencia
MIT © Francisco Renteria & Lucas Reydman