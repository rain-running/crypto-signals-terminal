import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
CandlestickSeries,
ColorType,
CrosshairMode,
HistogramSeries,
LineSeries,
LineStyle,
createChart,
createSeriesMarkers,
type IChartApi,
type SeriesMarker,
type UTCTimestamp,
} from "lightweight-charts";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api } from "./api";
import {
adx,
atr,
bollinger,
ema,
macd,
percentile,
rsi,
structureMarks,
swings,
zonesFromSwings,
type Bar,
type StructureMark,
} from "./analytics";

type Asset = "BTC" | "ETH" | "SOL";
type Timeframe = "15m" | "1h" | "4h";

const assets: Asset[] = ["BTC", "ETH", "SOL"];
const timeframes: Timeframe[] = ["15m", "1h", "4h"];

function lastValue(values: Array<number | null>): number | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (value !== null && value !== undefined && Number.isFinite(value)) return value;
  }
  return null;
}

function formatPrice(value: number | null, asset: Asset): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: asset === "BTC" ? 1 : 2,
    maximumFractionDigits: asset === "BTC" ? 1 : 3,
  }).format(value);
}

function formatCompact(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

function markerFor(mark: StructureMark): SeriesMarker<UTCTimestamp> {
  const time = mark.time as UTCTimestamp;
  switch (mark.kind) {
    case "swingHigh": return { time, position: "aboveBar", color: "#ef6a6a", shape: "circle", size: 0.7 };
    case "swingLow": return { time, position: "belowBar", color: "#39c889", shape: "circle", size: 0.7 };
    case "bosUp": return { time, position: "aboveBar", color: "#38d9c8", shape: "arrowUp", text: "BOS↑", size: 1 };
    case "bosDown": return { time, position: "belowBar", color: "#f2b84b", shape: "arrowDown", text: "BOS↓", size: 1 };
    case "bearDiv": return { time, position: "aboveBar", color: "#f2b84b", shape: "square", text: "顶背离", size: 0.8 };
    case "bullDiv": return { time, position: "belowBar", color: "#38d9c8", shape: "square", text: "底背离", size: 0.8 };
  }
}

function MarketChart({ bars, marks, asset }: { bars: Bar[]; marks: StructureMark[]; asset: Asset }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const closes = useMemo(() => bars.map((bar) => bar.close), [bars]);
  const ema20 = useMemo(() => ema(closes, 20), [closes]);
  const ema50 = useMemo(() => ema(closes, 50), [closes]);
  const bands = useMemo(() => bollinger(closes), [closes]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || bars.length === 0) return;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientWidth < 640 ? 390 : 520,
      layout: { background: { type: ColorType.Solid, color: "#0c1217" }, textColor: "#8b99a6", fontFamily: "IBM Plex Mono, SFMono-Regular, Consolas, monospace", fontSize: 11 },
      grid: { vertLines: { color: "#172129" }, horzLines: { color: "#172129" } },
      rightPriceScale: { borderColor: "#26333d", scaleMargins: { top: 0.08, bottom: 0.23 } },
      timeScale: { borderColor: "#26333d", timeVisible: true, secondsVisible: false, rightOffset: 4, barSpacing: 7, minBarSpacing: 2 },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: "#52606b", labelBackgroundColor: "#26333d" }, horzLine: { color: "#52606b", labelBackgroundColor: "#26333d" } },
      localization: { priceFormatter: (price: number) => formatPrice(price, asset) },
    });
    chartRef.current = chart;
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#39c889", downColor: "#ef6a6a", wickUpColor: "#39c889", wickDownColor: "#ef6a6a", borderVisible: false,
    });
    candles.setData(bars.map((bar) => ({ time: bar.time as UTCTimestamp, open: bar.open, high: bar.high, low: bar.low, close: bar.close })));

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false,
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volume.setData(bars.filter((bar) => bar.volume !== null).map((bar) => ({
      time: bar.time as UTCTimestamp,
      value: bar.volume ?? 0,
      color: bar.close >= bar.open ? "rgba(57,200,137,.34)" : "rgba(239,106,106,.34)",
    })));

    const addLine = (values: Array<number | null>, color: string, width: 1 | 2, style = LineStyle.Solid) => {
      const series = chart.addSeries(LineSeries, { color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      series.setData(values.flatMap((value, index) => {
        const bar = bars[index];
        return value === null || value === undefined || !bar ? [] : [{ time: bar.time as UTCTimestamp, value }];
      }));
    };
    addLine(ema20, "#38d9c8", 2);
    addLine(ema50, "#f2b84b", 2);
    addLine(bands.upper, "rgba(155,173,187,.62)", 1, LineStyle.Dashed);
    addLine(bands.middle, "rgba(155,173,187,.28)", 1, LineStyle.Dotted);
    addLine(bands.lower, "rgba(155,173,187,.62)", 1, LineStyle.Dashed);
    createSeriesMarkers(candles, marks.map(markerFor));
    chart.timeScale().fitContent();

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      chart.applyOptions({ width: Math.floor(entry.contentRect.width), height: entry.contentRect.width < 640 ? 390 : 520 });
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [asset, bands, bars, ema20, ema50, marks]);

  return <div ref={containerRef} className="chart-shell" aria-label={`${asset} K线、成交量与结构标记图`} />;
}

function StatusMeter({ label, value, tone = "cyan" }: { label: string; value: string; tone?: "cyan" | "amber" | "green" | "red" }) {
  return (
    <div className="status-row">
      <span>{label}</span>
      <strong className={`tone-${tone}`}>{value}</strong>
    </div>
  );
}

export function App() {
  const [asset, setAsset] = useState<Asset>("BTC");
  const [timeframe, setTimeframe] = useState<Timeframe>("15m");
  const [showStructure, setShowStructure] = useState(true);
  const [capital, setCapital] = useState("10000");
  const [riskPct, setRiskPct] = useState("1");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");

  const market = useQuery({
    queryKey: ["market", asset, timeframe],
    queryFn: () => api.getMarketData({ asset, timeframe }),
    staleTime: 45_000,
    refetchOnWindowFocus: false,
  });
  const bars = (market.data?.bars ?? []) as Bar[];

  const analysis = useMemo(() => {
    const closes = bars.map((bar) => bar.close);
    const rsiValues = rsi(bars);
    const atrValues = atr(bars);
    const direction = adx(bars);
    const macdValues = macd(closes);
    const swingPoints = swings(bars);
    const currentAtr = lastValue(atrValues);
    const atrSamples = atrValues.filter((value): value is number => value !== null && Number.isFinite(value));
    return {
      rsi: lastValue(rsiValues),
      atr: currentAtr,
      atrPercentile: currentAtr === null ? null : percentile(atrValues, currentAtr),
      atrSamples: atrSamples.length,
      adx: lastValue(direction.adx),
      plusDi: lastValue(direction.plusDi),
      minusDi: lastValue(direction.minusDi),
      macdLine: lastValue(macdValues.line),
      macdSignal: lastValue(macdValues.signal),
      macdHistogram: lastValue(macdValues.histogram),
      marks: structureMarks(bars, swingPoints, rsiValues),
      zones: zonesFromSwings(bars, swingPoints).slice(0, 8),
      swings: swingPoints,
    };
  }, [bars]);

  const latest = bars.at(-1) ?? null;
  const previous = bars.at(-2) ?? null;
  const change = latest && previous ? (latest.close / previous.close - 1) * 100 : null;
  const adxState = analysis.adx === null ? "—" : analysis.adx > 25 ? "趋势市（强）" : analysis.adx >= 20 ? "趋势市（弱）" : "震荡市";
  const diState = analysis.plusDi === null || analysis.minusDi === null ? "—" : analysis.plusDi >= analysis.minusDi ? "+DI 占优" : "-DI 占优";
  const volatilityState = analysis.atrPercentile === null ? "—" : analysis.atrPercentile > 70 ? "高波动" : analysis.atrPercentile < 30 ? "低波动" : "正常";
  const rsiState = analysis.rsi === null ? "—" : analysis.rsi >= 70 ? "偏热" : analysis.rsi <= 30 ? "偏冷" : "中性";

  const capitalNumber = Number(capital);
  const riskNumber = Number(riskPct);
  const entryNumber = Number(entry);
  const stopNumber = Number(stop);
  const riskAmount = capitalNumber > 0 && riskNumber > 0 ? capitalNumber * riskNumber / 100 : null;
  const stopDistance = entryNumber > 0 && stopNumber > 0 ? Math.abs(entryNumber - stopNumber) : null;
  const positionSize = riskAmount !== null && stopDistance && stopDistance > 0 ? riskAmount / stopDistance : null;
  const notional = positionSize !== null && entryNumber > 0 ? positionSize * entryNumber : null;

  return (
    <div className="terminal min-h-screen">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <header className="topbar">
        <div className="asset-tabs" aria-label="币种选择">
          {assets.map((item) => <button key={item} className={item === asset ? "active" : ""} onClick={() => setAsset(item)}>{item}</button>)}
        </div>
        <div className="source-strip">
          <span className={`live-dot ${market.data?.ok ? "on" : ""}`} />
          <span>{market.isFetching ? "连接中" : market.data?.source ?? "暂无来源"}</span>
          <span className="source-time">{market.data?.fetchedAt ? new Date(market.data.fetchedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</span>
          <button className="refresh" onClick={() => void market.refetch()} disabled={market.isFetching} aria-label="刷新行情">↻</button>
        </div>
      </header>

      <main className="workspace">
        <section className="market-heading">
          <div>
            <div className="pair-line"><span>{asset}/USD</span><span className="period-label">{timeframe}</span></div>
            <div className="price-line">
              <strong>{formatPrice(latest?.close ?? null, asset)}</strong>
              <span className={change !== null && change < 0 ? "down" : "up"}>{change === null ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}</span>
            </div>
          </div>
          <div className="time-tabs" aria-label="周期选择">
            {timeframes.map((item) => <button key={item} className={item === timeframe ? "active" : ""} onClick={() => setTimeframe(item)}>{item}</button>)}
          </div>
        </section>

        {market.isPending ? (
          <div className="loading-panel"><div className="pulse-line" /><p>正在读取市场数据…</p></div>
        ) : market.error || market.data?.ok === false ? (
          <div className="error-panel">
            <strong>行情暂时不可用</strong>
            <p>{market.data?.error ?? "连接行情源时发生错误。"}</p>
            <button onClick={() => void market.refetch()}>重新加载</button>
          </div>
        ) : (
          <>
            <div className="desktop-grid">
              <section className="chart-panel">
                <div className="chart-toolbar">
                  <div className="legend"><span className="ema20">EMA20</span><span className="ema50">EMA50</span><span className="bb">布林带</span></div>
                  <label className="toggle"><input type="checkbox" checked={showStructure} onChange={(event) => setShowStructure(event.target.checked)} /><span>结构标记</span></label>
                </div>
                <MarketChart bars={bars} marks={showStructure ? analysis.marks : []} asset={asset} />
                {bars.every((bar) => bar.volume === null) && <p className="volume-note">当前降级源未提供成交量。</p>}
              </section>

              <aside className="state-column">
                <section className="section-block market-state">
                  <div className="section-title"><h2>市况状态</h2><span>{bars.length} 根样本</span></div>
                  <div className="state-hero">
                    <div><span>ADX 14</span><strong>{analysis.adx?.toFixed(1) ?? "—"}</strong></div>
                    <div><span>市场形态</span><strong>{adxState}</strong></div>
                  </div>
                  <StatusMeter label="方向强度" value={diState} tone={analysis.plusDi !== null && analysis.minusDi !== null && analysis.plusDi >= analysis.minusDi ? "green" : "red"} />
                  <div className="di-track"><span style={{ width: `${Math.max(0, Math.min(100, analysis.plusDi ?? 50))}%` }} /></div>
                  <StatusMeter label="+DI / -DI" value={`${analysis.plusDi?.toFixed(1) ?? "—"} / ${analysis.minusDi?.toFixed(1) ?? "—"}`} />
                </section>

                <section className="section-block volatility">
                  <div className="section-title"><h2>波动率</h2><span>ATR 14</span></div>
                  <div className="metric-pair"><strong>{formatPrice(analysis.atr, asset)}</strong><span>{volatilityState}</span></div>
                  <div className="percentile"><div style={{ width: `${analysis.atrPercentile ?? 0}%` }} /><i style={{ left: `${analysis.atrPercentile ?? 0}%` }} /></div>
                  <p>历史分位 {analysis.atrPercentile?.toFixed(0) ?? "—"}% · {analysis.atrSamples} 个同周期样本</p>
                </section>

                <section className="section-block momentum">
                  <div className="section-title"><h2>动量状态</h2><span>本地计算</span></div>
                  <div className="momentum-grid">
                    <div><span>RSI 14</span><strong>{analysis.rsi?.toFixed(1) ?? "—"}</strong><small>{rsiState}</small></div>
                    <div><span>MACD</span><strong>{formatCompact(analysis.macdLine)}</strong><small>柱 {formatCompact(analysis.macdHistogram)}</small></div>
                  </div>
                  <StatusMeter label="MACD 线 / 平滑线" value={`${formatCompact(analysis.macdLine)} / ${formatCompact(analysis.macdSignal)}`} tone="amber" />
                </section>
              </aside>
            </div>

            <div className="lower-grid">
              <section className="section-block levels">
                <div className="section-title"><h2>关键价位区</h2><span>最近 100 根 · 由近到远</span></div>
                {analysis.zones.length === 0 ? <p className="empty">尚无足够的已确认 Swing 点。</p> : (
                  <div className="zone-list">
                    {analysis.zones.map((zone, index) => (
                      <div className="zone-row" key={`${zone.kind}-${zone.center}-${index}`}>
                        <div className={`zone-glyph ${zone.kind}`}><i /><span>{zone.kind === "resistance" ? "阻力" : "支撑"}</span></div>
                        <div className="zone-price"><strong>{zone.min === zone.max ? formatPrice(zone.center, asset) : `${formatPrice(zone.min, asset)}–${formatPrice(zone.max, asset)}`}</strong><small>{zone.touches} 次触及</small></div>
                        <div className="zone-type">{zone.liquidity ? (zone.kind === "resistance" ? "买方流动性区" : "卖方流动性区") : "结构价位"}</div>
                        <div className={zone.distancePct < 0 ? "distance down" : "distance up"}>{zone.distancePct >= 0 ? "+" : ""}{zone.distancePct.toFixed(2)}%</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="section-block calculator">
                <div className="section-title"><h2>仓位计算器</h2><span>固定风险法</span></div>
                <div className="form-grid">
                  <label><span>本金（USD）</span><input aria-label="本金（USD）" inputMode="decimal" value={capital} onChange={(event) => setCapital(event.target.value)} /></label>
                  <label><span>风险比例（%）</span><input aria-label="风险比例（%）" inputMode="decimal" value={riskPct} onChange={(event) => setRiskPct(event.target.value)} /></label>
                  <label><span>入场价</span><input aria-label="入场价" inputMode="decimal" value={entry} onChange={(event) => setEntry(event.target.value)} placeholder={formatPrice(latest?.close ?? null, asset)} /></label>
                  <label><span>止损价</span><input aria-label="止损价" inputMode="decimal" value={stop} onChange={(event) => setStop(event.target.value)} placeholder="输入计划价位" /></label>
                </div>
                <div className="calc-output">
                  <div><span>风险金额</span><strong>{riskAmount === null ? "—" : `$${formatPrice(riskAmount, "BTC")}`}</strong></div>
                  <div><span>仓位数量</span><strong>{positionSize === null ? "—" : `${formatCompact(positionSize)} ${asset}`}</strong></div>
                  <div><span>名义价值</span><strong>{notional === null ? "—" : `$${formatCompact(notional)}`}</strong></div>
                </div>
              </section>
            </div>
          </>
        )}
      </main>
      <footer>本工具仅呈现市场结构与客观状态，不构成交易信号或投资建议。</footer>
    </div>
  );
}
