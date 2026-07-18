SHARPRFI — Modelo de NRFI/YRFI para MLB
SHARPRFI es una herramienta independiente que estima la probabilidad de que NO haya carreras en la primera entrada (NRFI) o de que SÍ haya al menos una carrera (YRFI) en cada partido de la MLB. Está diseñada para apostadores que buscan identificar apuestas con valor esperado positivo (+EV) comparando las probabilidades del modelo con las cuotas ofrecidas por las casas de apuestas.

El modelo combina un motor Poisson y una simulación Monte Carlo, ambos entrenados y calibrados exclusivamente con estadísticas del primer inning. Incluye más de 10 factores ajustados, desde el rendimiento del abridor en la primera entrada hasta variables contextuales como el clima y el platoon.

🧠 Mejoras clave respecto al modelo original
Mejora	Descripción
Estadísticas de pitcher en el 1er inning	FIP, K% y BB% extraídos exclusivamente de los juegos del lanzador filtrados por inning=1.
Estadísticas de bateador en el 1er inning	OBP y wOBA del top-5 calculados solo sobre sus apariciones en el primer turno.
First‑Inning ERA (FIE)	Factor que corrige el FIP con el ERA específico del lanzador en la primera entrada.
BB/9 (Walk Rate)	Ajuste por la tasa de bases por bolas en el 1er inning, con shrink hacia la media de liga.
Humedad	Factor climático que modula el carry de la pelota (días húmedos → menos HR).
Platoon (mano a mano)	Ajuste del OBP del bateador según la mano del pitcher (zurdo/derecho) usando splits de 1er inning.
wOBA top‑5	Reemplazo del OBP por wOBA en el factor de orden de bateo, capturando mejor el poder ofensivo.
Recalibrado de BASE_LAMBDA	Ajustado a la tasa real de YRFI de 2026 (51.8%) para eliminar el sesgo histórico.
Clamp más conservador	Rango de ajuste reducido de [0.55, 1.55] a [0.60, 1.45] para evitar extremos irreales.
⚙️ Cómo funciona el modelo
Motor Poisson
El modelo parte de una tasa base λ = 0.366 para cada medio inning (calibrada con los datos de 2026). Luego aplica un factor de ajuste combinado que integra:

Pitcher → FIP (1er inning), K%, Barrel Rate, FIE, BB/9

Bateadores → wOBA/OBP del top-5 (con pesos de participación)

Equipo → OBP global

Contexto → Park Factor, Temperatura, Viento, Humedad, Platoon

El factor se mantiene dentro de un rango conservador ([0.60, 1.45]) para que las predicciones no se desvíen de la realidad de la MLB.

text
λ = 0.366 × A_bounded
A_bounded = clamp(∏ factores, 0.60, 1.45)
P(YRFI) = 1 − e^(−λ_home) × e^(−λ_away)
Simulación Monte Carlo
El segundo motor replica el primer inning 10,000 veces por partido utilizando:

wOBA del bateador (con shrink y ajuste por platoon).

OBP permitido por el lanzador (con shrink).

Park factor y (opcionalmente) rachas de victorias.

Avances de corredores con distribución de tipos de hit (65% sencillos, 20% dobles, 3% triples, 12% HR).

Blend final
La probabilidad final es un blend fijo 50/50 entre el Poisson y la simulación, que ha demostrado ser el que mejor Brier obtiene en backtest.

📊 Resultados de backtest (2026, 1,344 juegos)
Modelo	Brier	Calibración (gap)
Blend (Poisson + Sim)	0.2445	+1.2%
Poisson (1er inning)	0.2475	-1.1%
Simulación (sin rachas)	0.2457	+3.4%
Simulación + rachas	0.2532	+7.6%
Simulación original (faithful)	0.2577	-10.3%
Mejor variante: Blend Poisson+SimFixed
Calibración por bins (blend):

Rango	Juegos	Predicción	Real
30‑40%	9	38.2%	44.4%
40‑50%	391	46.7%	44.0%
50‑60%	808	54.3%	53.3%
60‑70%	121	63.1%	63.6%
70‑80%	15	72.1%	80.0%
El modelo está bien calibrado en la mayoría de los rangos; la desviación en 70‑80% se debe al pequeño tamaño de muestra (15 juegos).

🗂️ Estructura del proyecto
text
app/
  api/games/route.ts      # Endpoint principal
  components/             # UI (React, Tailwind)
  context/                # Preferencias del usuario
lib/
  mlb-api.ts              # Datos de MLB (1er inning, splits)
  poisson.ts              # Motor Poisson + factores
  sim.ts                  # Simulación Monte Carlo
  weather-api.ts          # Clima (incluye humedad)
  types.ts                # Interfaces TypeScript
scripts/
  backtest.mjs            # Backtest con bins de calibración
📦 Instalación y uso
bash
git clone https://github.com/francisconoe/Sharprfi2.git
cd sharprfi
npm install
npm run dev
Backtest
bash
npm run backtest -- 2026-03-26 2026-07-05 --compare-sim
Despliegue en Vercel
bash
npx vercel --prod
🧩 Fuentes de datos
MLB Stats API (gratuita) → schedule, pitchers, lineups, game logs.

Baseball Savant → barrel rate, hard‑hit rate.

Open‑Meteo → temperatura, viento, humedad.

📝 Notas finales
El modelo usa exclusivamente estadísticas del primer inning para pitchers y bateadores.

Todos los factores tienen shrinkage y clamp para evitar sobreajuste.

El blend 50/50 fue elegido por backtest; las rachas de equipo están desactivadas porque empeoran la calibración.

La humedad, FIE, BB/9 y wOBA son mejoras recientes que han contribuido a reducir el Brier a 0.2445.

📄 Licencia
MIT © Francisco Nevarez
