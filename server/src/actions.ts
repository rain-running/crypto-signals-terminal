import { defineAction, z, type ActionsModule } from "@hatch/space-sdk";

type Asset = "BTC" | "ETH" | "SOL";
type Timeframe = "15m" | "1h" | "4h";
type Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

const barSchema = z.object({
  time: z.number().int(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().nullable(),
});

const marketResponse = z.object({
  ok: z.boolean(),
  source: z.string().nullable(),
  bars: z.array(barSchema),
  fetchedAt: z.string(),
  error: z.string().nullable(),
});

type MarketResponse = z.infer<typeof marketResponse>;

const symbolMap: Record<Asset, string> = { BTC: "BTCUSDT", ETH: "ETHUSDT", SOL: "SOLUSDT" };
const krakenMap: Record<Asset, string> = { BTC: "XBTUSD", ETH: "ETHUSD", SOL: "SOLUSD" };
const coinGeckoMap: Record<Asset, string> = { BTC: "bitcoin", ETH: "ethereum", SOL: "solana" };
const binanceInterval: Record<Timeframe, string> = { "15m": "15m", "1h": "1h", "4h": "4h" };
const bybitInterval: Record<Timeframe, string> = { "15m": "15", "1h": "60", "4h": "240" };
const krakenInterval: Record<Timeframe, string> = { "15m": "15", "1h": "60", "4h": "240" };

function validBar(bar: Bar): boolean {
  return Number.isFinite(bar.time) && Number.isFinite(bar.open) && Number.isFinite(bar.high) &&
    Number.isFinite(bar.low) && Number.isFinite(bar.close) && bar.time > 0 && bar.high >= bar.low;
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "Muse-Market-Structure/1.0" },
    signal: AbortSignal.timeout(9_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

function normalizeRows(rows: unknown[]): Bar[] {
  return rows
    .map((raw): Bar | null => {
      if (!Array.isArray(raw) || raw.length < 6) return null;
      const timeRaw = Number(raw[0]);
      const bar: Bar = {
        time: timeRaw > 10_000_000_000 ? Math.floor(timeRaw / 1000) : Math.floor(timeRaw),
        open: Number(raw[1]),
        high: Number(raw[2]),
        low: Number(raw[3]),
        close: Number(raw[4]),
        volume: Number.isFinite(Number(raw[5])) ? Number(raw[5]) : null,
      };
      return validBar(bar) ? bar : null;
    })
    .filter((bar): bar is Bar => bar !== null)
    .sort((a, b) => a.time - b.time);
}

async function loadBinance(asset: Asset, timeframe: Timeframe, futures: boolean): Promise<Bar[]> {
  const host = futures ? "https://fapi.binance.com/fapi/v1/klines" : "https://api.binance.com/api/v3/klines";
  const url = `${host}?symbol=${symbolMap[asset]}&interval=${binanceInterval[timeframe]}&limit=500`;
  const json = await getJson(url);
  if (!Array.isArray(json)) throw new Error("Unexpected Binance response");
  return normalizeRows(json);
}

async function loadBybit(asset: Asset, timeframe: Timeframe): Promise<Bar[]> {
  const url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbolMap[asset]}&interval=${bybitInterval[timeframe]}&limit=500`;
  const json = await getJson(url) as { retCode?: number; result?: { list?: unknown[] } };
  if (json.retCode !== 0 || !Array.isArray(json.result?.list)) throw new Error("Unexpected Bybit response");
  return normalizeRows(json.result.list).reverse().sort((a, b) => a.time - b.time);
}

async function loadKraken(asset: Asset, timeframe: Timeframe): Promise<Bar[]> {
  const url = `https://api.kraken.com/0/public/OHLC?pair=${krakenMap[asset]}&interval=${krakenInterval[timeframe]}`;
  const json = await getJson(url) as { error?: unknown[]; result?: Record<string, unknown> };
  if (!Array.isArray(json.error) || json.error.length > 0 || !json.result) throw new Error("Unexpected Kraken response");
  const key = Object.keys(json.result).find((candidate) => candidate !== "last");
  const rows = key ? json.result[key] : undefined;
  if (!Array.isArray(rows)) throw new Error("Kraken returned no candles");
  const adapted = rows.map((row) => {
    if (!Array.isArray(row)) return row;
    return [row[0], row[1], row[2], row[3], row[4], row[6]];
  });
  return normalizeRows(adapted);
}

async function loadCoinGecko(asset: Asset, timeframe: Timeframe): Promise<Bar[]> {
  const days = timeframe === "15m" ? "1" : timeframe === "1h" ? "7" : "30";
  const url = `https://api.coingecko.com/api/v3/coins/${coinGeckoMap[asset]}/ohlc?vs_currency=usd&days=${days}&precision=full`;
  const json = await getJson(url);
  if (!Array.isArray(json)) throw new Error("Unexpected CoinGecko response");
  return json
    .map((raw): Bar | null => {
      if (!Array.isArray(raw) || raw.length < 5) return null;
      const bar: Bar = {
        time: Math.floor(Number(raw[0]) / 1000),
        open: Number(raw[1]),
        high: Number(raw[2]),
        low: Number(raw[3]),
        close: Number(raw[4]),
        volume: null,
      };
      return validBar(bar) ? bar : null;
    })
    .filter((bar): bar is Bar => bar !== null)
    .sort((a, b) => a.time - b.time);
}

export const Actions = {
  getMarketData: defineAction({
    request: z.object({
      asset: z.enum(["BTC", "ETH", "SOL"]),
      timeframe: z.enum(["15m", "1h", "4h"]),
    }),
    response: marketResponse,
    async handler(_ctx, args): Promise<MarketResponse> {
      const attempts: Array<{ name: string; load: () => Promise<Bar[]> }> = [
        { name: "Binance 合约", load: () => loadBinance(args.asset, args.timeframe, true) },
        { name: "Binance 现货", load: () => loadBinance(args.asset, args.timeframe, false) },
        { name: "Bybit", load: () => loadBybit(args.asset, args.timeframe) },
        { name: "Kraken", load: () => loadKraken(args.asset, args.timeframe) },
        { name: "CoinGecko", load: () => loadCoinGecko(args.asset, args.timeframe) },
      ];

      for (const attempt of attempts) {
        try {
          const bars = await attempt.load();
          if (bars.length >= 30) {
            return { ok: true, source: attempt.name, bars, fetchedAt: new Date().toISOString(), error: null };
          }
        } catch {
          // Continue to the next user-requested provider.
        }
      }

      return {
        ok: false,
        source: null,
        bars: [],
        fetchedAt: new Date().toISOString(),
        error: "当前所有行情源均不可用，请稍后刷新重试。",
      };
    },
  }),
} satisfies ActionsModule;
