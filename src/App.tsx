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

function formatPct(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

const kellyFractions = [
  { value: 1, label: "全凯利" },
  { value: 0.5, label: "半凯利" },
  { value: 0.25, label: "1/4 凯利" },
];

function markerFor(mark: StructureMark): SeriesMarker<UTCTimestamp> {
  const time = mark.time as UTCTimestamp;
  switch (mark.kind) {
    case "swingHigh": return { time, position: "aboveBar", color: "#eab308", shape: "circle", size: 0.7 };
    case "swingLow": return { time, position: "belowBar", color: "#2dd4bf", shape: "circle", size: 0.7 };
    case "bosUp": return { time, position: "aboveBar", color: "#2dd4bf", shape: "arrowUp", text: "BOS↑", size: 1 };
    case "bosDown": return { time, position: "belowBar", color: "#eab308", shape: "arrowDown", text: "BOS↓", size: 1 };
    case "bearDiv": return { time, position: "aboveBar", color: "#eab308", shape: "square", text: "顶背离", size: 0.8 };
    case "bullDiv": return { time, position: "belowBar", color: "#2dd4bf", shape: "square", text: "底背离", size: 0.8 };
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
      layout: { background: { type: ColorType.Solid, color: "#090d13" }, textColor: "#5f6e7d", fontFamily: "IBM Plex Mono, SFMono-Regular, Consolas, monospace", fontSize: 11 },
      grid: { vertLines: { color: "#0f151d" }, horzLines: { color: "#0f151d" } },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.14)", scaleMargins: { top: 0.08, bottom: 0.23 } },
      timeScale: { borderColor: "rgba(148,163,184,0.14)", timeVisible: true, secondsVisible: false, rightOffset: 4, barSpacing: 7, minBarSpacing: 2 },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: "#3b4a5a", labelBackgroundColor: "#1a232e" }, horzLine: { color: "#3b4a5a", labelBackgroundColor: "#1a232e" } },
      localization: { priceFormatter: (price: number) => formatPrice(price, asset) },
    });
    chartRef.current = chart;
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a", downColor: "#ef5350", wickUpColor: "#26a69a", wickDownColor: "#ef5350", borderVisible: false,
    });
    candles.setData(bars.map((bar) => ({ time: bar.time as UTCTimestamp, open: bar.open, high: bar.high, low: bar.low, close: bar.close })));

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false,
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volume.setData(bars.filter((bar) => bar.volume !== null).map((bar) => ({
      time: bar.time as UTCTimestamp,
      value: bar.volume ?? 0,
      color: bar.close >= bar.open ? "rgba(38,166,154,.28)" : "rgba(239,83,80,.28)",
    })));

    const addLine = (values: Array<number | null>, color: string, width: 1 | 2, style = LineStyle.Solid) => {
      const series = chart.addSeries(LineSeries, { color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      series.setData(values.flatMap((value, index) => {
        const bar = bars[index];
        return value === null || value === undefined || !bar ? [] : [{ time: bar.time as UTCTimestamp, value }];
      }));
    };
    addLine(ema20, "#eab308", 2);
    addLine(ema50, "#60a5fa", 2);
    addLine(bands.upper, "rgba(153,167,181,.5)", 1, LineStyle.Dashed);
    addLine(bands.middle, "rgba(153,167,181,.22)", 1, LineStyle.Dotted);
    addLine(bands.lower, "rgba(153,167,181,.5)", 1, LineStyle.Dashed);
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
  const [kellyCapital, setKellyCapital] = useState("10000");
  const [kellyWinRate, setKellyWinRate] = useState("55");
  const [kellyRR, setKellyRR] = useState("2");
  const [kellyFraction, setKellyFraction] = useState(0.5);

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
  const isTrend = analysis.adx !== null && analysis.adx >= 20;
  const diState = analysis.plusDi === null || analysis.minusDi === null ? "—" : analysis.plusDi >= analysis.minusDi ? "+DI 占优" : "-DI 占优";
  const volatilityState = analysis.atrPercentile === null ? "—" : analysis.atrPercentile > 70 ? "高波动" : analysis.atrPercentile < 30 ? "低波动" : "正常";
  const rsiState = analysis.rsi === null ? "—" : analysis.rsi >= 70 ? "偏热" : analysis.rsi <= 30 ? "偏冷" : "中性";

  // 凯利公式：f* = p − (1−p) / R（p 为胜率，R 为平均盈亏比）
  const kellyP = Number(kellyWinRate) / 100;
  const kellyR = Number(kellyRR);
  const kellyCapNum = Number(kellyCapital);
  const fullKelly =
    Number.isFinite(kellyP) && kellyP >= 0 && kellyP <= 1 && Number.isFinite(kellyR) && kellyR > 0
      ? kellyP - (1 - kellyP) / kellyR
      : null;
  const hasEdge = fullKelly !== null && fullKelly > 0;
  const adjKelly = hasEdge ? fullKelly * kellyFraction : null;
  const kellyAmount = adjKelly !== null && kellyCapNum > 0 ? kellyCapNum * adjKelly : null;
  const kellyEV = fullKelly !== null ? kellyP * kellyR - (1 - kellyP) : null; // 每单位风险的期望收益

  return (
    <div className="terminal min-h-screen">
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
          <div className="loading-panel">
            <div className="skeleton-chart" aria-hidden="true"><i /><i /><i /></div>
            <p>正在读取市场数据…</p>
          </div>
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
                    <span className={`regime-badge ${isTrend ? "trend" : "chop"}`}>{adxState}</span>
                  </div>
                  <StatusMeter label="方向强度" value={diState} tone={analysis.plusDi !== null && analysis.minusDi !== null && analysis.plusDi >= analysis.minusDi ? "green" : "red"} />
                  <div className="di-track"><span style={{ width: `${Math.max(0, Math.min(100, analysis.plusDi ?? 50))}%` }} /></div>
                  <StatusMeter label="+DI / -DI" value={`${analysis.plusDi?.toFixed(1) ?? "—"} / ${analysis.minusDi?.toFixed(1) ?? "—"}`} />
                </section>

                <section className="section-block volatility">
                  <div className="section-title"><h2>波动率</h2><span>ATR 14</span></div>
                  <div className="metric-pair"><strong>{formatPrice(analysis.atr, asset)}</strong><span className="vol-tag">{volatilityState}</span></div>
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

              <section className="section-block kelly">
                <div className="section-title"><h2>凯利公式仓位</h2><span>f* = p − (1−p) / R</span></div>
                <div className="form-grid">
                  <label><span>本金（USD）</span><input aria-label="本金（USD）" inputMode="decimal" value={kellyCapital} onChange={(event) => setKellyCapital(event.target.value)} /></label>
                  <label><span>胜率（%）</span><input aria-label="胜率（%）" inputMode="decimal" value={kellyWinRate} onChange={(event) => setKellyWinRate(event.target.value)} placeholder="如 55" /></label>
                  <label><span>平均盈亏比 R</span><input aria-label="平均盈亏比 R" inputMode="decimal" value={kellyRR} onChange={(event) => setKellyRR(event.target.value)} placeholder="如 2" /></label>
                  <div className="kelly-fraction">
                    <span>凯利系数</span>
                    <div className="fraction-tabs" role="group" aria-label="凯利系数">
                      {kellyFractions.map((item) => (
                        <button key={item.value} className={item.value === kellyFraction ? "active" : ""} onClick={() => setKellyFraction(item.value)}>{item.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
                {hasEdge ? (
                  <div className="calc-output">
                    <div><span>全凯利比例 f*</span><strong>{formatPct(fullKelly)}</strong></div>
                    <div><span>建议仓位比例</span><strong className="tone-cyan">{formatPct(adjKelly)}</strong></div>
                    <div><span>建议仓位金额</span><strong>{kellyAmount === null ? "—" : `$${formatCompact(kellyAmount)}`}</strong></div>
                  </div>
                ) : (
                  <p className="kelly-verdict">{fullKelly === null ? "请输入有效的胜率与盈亏比。" : "期望值为负：该策略没有下注优势，建议不下注。"}</p>
                )}
                <p className="kelly-note">
                  {kellyEV !== null && Number.isFinite(kellyEV) ? `每单位风险期望收益 ${kellyEV >= 0 ? "+" : ""}${kellyEV.toFixed(2)}。` : ""}
                  全凯利波动剧烈，实务中常用半凯利或更低系数。
                </p>
              </section>
            </div>
          </>
        )}
      </main>
      <footer>本工具仅呈现市场结构与客观状态，不构成交易信号或投资建议。</footer>
    </div>
  );
}
