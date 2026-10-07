// 轻量 fetch 客户端，对应 /api/market-data serverless function。
// 调用签名与原 Hatch 版本的 typed RPC 保持一致：api.getMarketData({ asset, timeframe })。

export type Asset = "BTC" | "ETH" | "SOL";
export type Timeframe = "15m" | "1h" | "4h";

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export interface MarketDataResponse {
  ok: boolean;
  source: string | null;
  bars: Bar[];
  fetchedAt: string;
  error: string | null;
}

async function getMarketData(args: { asset: Asset; timeframe: Timeframe }): Promise<MarketDataResponse> {
  const params = new URLSearchParams({ asset: args.asset, timeframe: args.timeframe });
  const res = await fetch(`/api/market-data?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`行情请求失败（HTTP ${res.status}）`);
  }
  return (await res.json()) as MarketDataResponse;
}

export const api = { getMarketData };
