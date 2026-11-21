/**
 * Suavizado exponencial doble de Holt (nivel + tendencia). Funciones puras:
 * una serie de ~72 puntos y una rejilla de 16 combinaciones cuestan microsegundos
 * de CPU, muy por debajo del limite de 10 ms del plan Free.
 */

export interface HoltFit {
  alpha: number;
  beta: number;
  /** MAE del backtest con origen movil; null si la serie es demasiado corta. */
  mae: number | null;
}

export const HOLT_GRID = [0.2, 0.4, 0.6, 0.8] as const;
/** Puntos minimos para estimar un MAE de backtest. */
export const MIN_POINTS_FOR_MAE = 12;
/** Indice minimo de origen del backtest (4 puntos de entrenamiento). */
const MIN_ORIGIN = 3;

interface States {
  level: number[];
  trend: number[];
}

/** Estados de Holt: l[1]=y1, b[1]=y1-y0 y actualizacion estandar desde t=2. */
function filterStates(series: readonly number[], alpha: number, beta: number): States {
  const n = series.length;
  const level = new Array<number>(n).fill(0);
  const trend = new Array<number>(n).fill(0);
  const y0 = series[0] ?? 0;
  level[0] = y0;
  if (n < 2) return { level, trend };
  const y1 = series[1] ?? y0;
  level[1] = y1;
  trend[1] = y1 - y0;
  for (let t = 2; t < n; t++) {
    const y = series[t] ?? 0;
    const lp = level[t - 1] ?? 0;
    const bp = trend[t - 1] ?? 0;
    const l = alpha * y + (1 - alpha) * (lp + bp);
    level[t] = l;
    trend[t] = beta * (l - lp) + (1 - beta) * bp;
  }
  return { level, trend };
}

/** Previsiones a 1..horizon pasos. Serie vacia -> []; un punto -> prevision plana. */
export function holt(series: readonly number[], alpha: number, beta: number, horizon: number): number[] {
  const n = series.length;
  if (n === 0 || horizon <= 0) return [];
  if (n === 1) return new Array<number>(horizon).fill(series[0] ?? 0);
  const { level, trend } = filterStates(series, alpha, beta);
  const l = level[n - 1] ?? 0;
  const b = trend[n - 1] ?? 0;
  const out: number[] = [];
  for (let h = 1; h <= horizon; h++) out.push(l + h * b);
  return out;
}

/**
 * MAE con origen movil: para cada origen t se pronostican los pasos 1..horizon
 * y se comparan con los valores reales disponibles. Como el filtro es causal,
 * los estados en t equivalen a reajustar con la serie truncada en t.
 */
export function backtestMAE(series: readonly number[], alpha: number, beta: number, horizon: number): number | null {
  const n = series.length;
  if (n < MIN_ORIGIN + 2 || horizon <= 0) return null;
  const { level, trend } = filterStates(series, alpha, beta);
  let sum = 0;
  let count = 0;
  for (let t = MIN_ORIGIN; t <= n - 2; t++) {
    const l = level[t] ?? 0;
    const b = trend[t] ?? 0;
    for (let h = 1; h <= horizon && t + h <= n - 1; h++) {
      sum += Math.abs((series[t + h] ?? 0) - (l + h * b));
      count++;
    }
  }
  return count === 0 ? null : sum / count;
}

/** Busqueda en rejilla (alpha, beta en {0.2,0.4,0.6,0.8}) minimizando el MAE de backtest. */
export function fitHolt(series: readonly number[], horizon: number): HoltFit {
  if (series.length < MIN_POINTS_FOR_MAE) return { alpha: 0.4, beta: 0.2, mae: null };
  let best: HoltFit = { alpha: 0.4, beta: 0.2, mae: null };
  let bestMae = Infinity;
  for (const alpha of HOLT_GRID) {
    for (const beta of HOLT_GRID) {
      const mae = backtestMAE(series, alpha, beta, horizon);
      if (mae !== null && mae < bestMae) {
        bestMae = mae;
        best = { alpha, beta, mae };
      }
    }
  }
  return best;
}
