export type Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type Swing = { index: number; time: number; price: number; kind: "high" | "low" };
export type StructureMark = { time: number; kind: "swingHigh" | "swingLow" | "bosUp" | "bosDown" | "bearDiv" | "bullDiv" };
export type Zone = {
  kind: "resistance" | "support";
  min: number;
  max: number;
  center: number;
  distancePct: number;
  touches: number;
  liquidity: boolean;
};

function sma(values: number[], period: number): Array<number | null> {
  return values.map((_, index) => {
    if (index < period - 1) return null;
    let sum = 0;
    for (let i = index - period + 1; i <= index; i += 1) sum += values[i] ?? 0;
    return sum / period;
  });
}

export function ema(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (values.length < period) return out;
  const seed = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  out[period - 1] = seed;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i += 1) {
    const previous = out[i - 1];
    out[i] = previous === null || previous === undefined ? null : (values[i] ?? 0) * k + previous * (1 - k);
  }
  return out;
}

function wilder(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (values.length < period) return out;
  const seed = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  out[period - 1] = seed;
  for (let i = period; i < values.length; i += 1) {
    const previous = out[i - 1];
    out[i] = previous === null || previous === undefined ? null : (previous * (period - 1) + (values[i] ?? 0)) / period;
  }
  return out;
}

export function rsi(bars: Bar[], period = 14): Array<number | null> {
  const gains = Array<number>(bars.length).fill(0);
  const losses = Array<number>(bars.length).fill(0);
  for (let i = 1; i < bars.length; i += 1) {
    const change = (bars[i]?.close ?? 0) - (bars[i - 1]?.close ?? 0);
    gains[i] = Math.max(change, 0);
    losses[i] = Math.max(-change, 0);
  }
  const avgGain = wilder(gains.slice(1), period);
  const avgLoss = wilder(losses.slice(1), period);
  const out: Array<number | null> = Array(bars.length).fill(null);
  for (let i = period; i < bars.length; i += 1) {
    const gain = avgGain[i - 1];
    const loss = avgLoss[i - 1];
    if (gain === null || gain === undefined || loss === null || loss === undefined) continue;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function bollinger(values: number[], period = 20, multiplier = 2) {
  const middle = sma(values, period);
  const upper: Array<number | null> = Array(values.length).fill(null);
  const lower: Array<number | null> = Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i += 1) {
    const mean = middle[i];
    if (mean === null || mean === undefined) continue;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j += 1) sum += ((values[j] ?? mean) - mean) ** 2;
    const deviation = Math.sqrt(sum / period);
    upper[i] = mean + multiplier * deviation;
    lower[i] = mean - multiplier * deviation;
  }
  return { middle, upper, lower };
}

export function atr(bars: Bar[], period = 14): Array<number | null> {
  const tr = bars.map((bar, index) => {
    if (index === 0) return bar.high - bar.low;
    const previous = bars[index - 1]?.close ?? bar.close;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - previous), Math.abs(bar.low - previous));
  });
  return wilder(tr, period);
}

export function adx(bars: Bar[], period = 14) {
  const tr = Array<number>(bars.length).fill(0);
  const plusDm = Array<number>(bars.length).fill(0);
  const minusDm = Array<number>(bars.length).fill(0);
  for (let i = 1; i < bars.length; i += 1) {
    const current = bars[i];
    const previous = bars[i - 1];
    if (!current || !previous) continue;
    const up = current.high - previous.high;
    const down = previous.low - current.low;
    plusDm[i] = up > down && up > 0 ? up : 0;
    minusDm[i] = down > up && down > 0 ? down : 0;
    tr[i] = Math.max(current.high - current.low, Math.abs(current.high - previous.close), Math.abs(current.low - previous.close));
  }
  const smoothTr = wilder(tr.slice(1), period);
  const smoothPlus = wilder(plusDm.slice(1), period);
  const smoothMinus = wilder(minusDm.slice(1), period);
  const plusDi: Array<number | null> = Array(bars.length).fill(null);
  const minusDi: Array<number | null> = Array(bars.length).fill(null);
  const dx: number[] = Array(Math.max(0, bars.length - 1)).fill(0);
  for (let i = period; i < bars.length; i += 1) {
    const denominator = smoothTr[i - 1];
    const p = smoothPlus[i - 1];
    const m = smoothMinus[i - 1];
    if (!denominator || p === null || p === undefined || m === null || m === undefined) continue;
    plusDi[i] = 100 * p / denominator;
    minusDi[i] = 100 * m / denominator;
    const total = (plusDi[i] ?? 0) + (minusDi[i] ?? 0);
    dx[i - 1] = total === 0 ? 0 : 100 * Math.abs((plusDi[i] ?? 0) - (minusDi[i] ?? 0)) / total;
  }
  const smoothDx = wilder(dx, period);
  const adxValues: Array<number | null> = Array(bars.length).fill(null);
  for (let i = period * 2; i < bars.length; i += 1) adxValues[i] = smoothDx[i - 1] ?? null;
  return { adx: adxValues, plusDi, minusDi };
}

export function macd(values: number[]) {
  const fast = ema(values, 12);
  const slow = ema(values, 26);
  const line = values.map((_, index) => {
    const a = fast[index];
    const b = slow[index];
    return a === null || a === undefined || b === null || b === undefined ? null : a - b;
  });
  const compact = line.map((value) => value ?? 0);
  const signalRaw = ema(compact.slice(25), 9);
  const signal: Array<number | null> = Array(values.length).fill(null);
  for (let i = 33; i < values.length; i += 1) signal[i] = signalRaw[i - 25] ?? null;
  const histogram = line.map((value, index) => {
    const sig = signal[index];
    return value === null || sig === null || sig === undefined ? null : value - sig;
  });
  return { line, signal, histogram };
}

export function swings(bars: Bar[], span = 3): Swing[] {
  const result: Swing[] = [];
  for (let i = span; i < bars.length - span; i += 1) {
    const bar = bars[i];
    if (!bar) continue;
    let high = true;
    let low = true;
    for (let j = i - span; j <= i + span; j += 1) {
      if (j === i) continue;
      const other = bars[j];
      if (!other) continue;
      if (other.high >= bar.high) high = false;
      if (other.low <= bar.low) low = false;
    }
    if (high) result.push({ index: i, time: bar.time, price: bar.high, kind: "high" });
    if (low) result.push({ index: i, time: bar.time, price: bar.low, kind: "low" });
  }
  return result.sort((a, b) => a.index - b.index);
}

export function structureMarks(bars: Bar[], points: Swing[], rsiValues: Array<number | null>): StructureMark[] {
  const marks: StructureMark[] = points.map((point) => ({
    time: point.time,
    kind: point.kind === "high" ? "swingHigh" : "swingLow",
  }));
  let latestHigh: Swing | null = null;
  let latestLow: Swing | null = null;
  let highBroken = false;
  let lowBroken = false;
  for (let i = 0; i < bars.length; i += 1) {
    const confirmed = points.filter((point) => point.index + 3 === i);
    for (const point of confirmed) {
      if (point.kind === "high") { latestHigh = point; highBroken = false; }
      else { latestLow = point; lowBroken = false; }
    }
    const bar = bars[i];
    if (!bar) continue;
    if (latestHigh && !highBroken && bar.close > latestHigh.price) {
      marks.push({ time: bar.time, kind: "bosUp" });
      highBroken = true;
    }
    if (latestLow && !lowBroken && bar.close < latestLow.price) {
      marks.push({ time: bar.time, kind: "bosDown" });
      lowBroken = true;
    }
  }
  const recent = points.filter((point) => point.index >= bars.length - 50);
  for (const kind of ["high", "low"] as const) {
    const same = recent.filter((point) => point.kind === kind);
    for (let i = 1; i < same.length; i += 1) {
      const previous = same[i - 1];
      const current = same[i];
      if (!previous || !current) continue;
      const previousRsi = rsiValues[previous.index];
      const currentRsi = rsiValues[current.index];
      if (previousRsi === null || previousRsi === undefined || currentRsi === null || currentRsi === undefined) continue;
      if (kind === "high" && current.price > previous.price && currentRsi < previousRsi) marks.push({ time: current.time, kind: "bearDiv" });
      if (kind === "low" && current.price < previous.price && currentRsi > previousRsi) marks.push({ time: current.time, kind: "bullDiv" });
    }
  }
  return marks.sort((a, b) => a.time - b.time).slice(-140);
}

export function zonesFromSwings(bars: Bar[], points: Swing[]): Zone[] {
  const current = bars.at(-1)?.close;
  if (!current) return [];
  const start = Math.max(0, bars.length - 100);
  const recent = points.filter((point) => point.index >= start);
  const zones: Zone[] = [];
  for (const kind of ["high", "low"] as const) {
    const source = recent.filter((point) => point.kind === kind).sort((a, b) => a.price - b.price);
    const groups: Swing[][] = [];
    for (const point of source) {
      const group = groups.find((candidate) => {
        const center = candidate.reduce((sum, item) => sum + item.price, 0) / candidate.length;
        return Math.abs(point.price - center) / center < 0.003;
      });
      if (group) group.push(point);
      else groups.push([point]);
    }
    for (const group of groups) {
      const prices = group.map((point) => point.price);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const center = (min + max) / 2;
      zones.push({
        kind: kind === "high" ? "resistance" : "support",
        min,
        max,
        center,
        distancePct: (center / current - 1) * 100,
        touches: group.length,
        liquidity: group.length >= 2 && (max - min) / center <= 0.003,
      });
    }
  }
  return zones.sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct));
}

export function percentile(values: Array<number | null>, current: number): number {
  const usable = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!usable.length) return 0;
  return 100 * usable.filter((value) => value <= current).length / usable.length;
}
