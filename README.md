# 市场结构终端 / Crypto Market Structure Terminal

加密货币市场结构查看终端：多币种、多周期 K 线与技术指标，叠加市场结构识别（Swing / BOS）、动量背离、支撑阻力与流动性区，以及仓位计算器。

**原则：只呈现市场结构，不输出任何做多 / 做空交易信号，不构成投资建议。**

> 这是 `vercel-port` 分支：从 Hatch space 运行时移植出的**标准 Vercel 可部署版本**。
> `main` 分支保留原始 Hatch 版本源码。

## 移植说明（相对原版的改动）

- 服务端 `getMarketData` action → `api/market-data.ts`（Vercel serverless function），行情源降级链逻辑不变
- 客户端 RPC（`@hatch/space-sdk`）→ 标准 `fetch`（`src/api.ts`），调用签名不变
- `spaceQueryClient` → 标准 `@tanstack/react-query` `QueryClient`
- 去掉 `SafeAreaTopScrim`（顶栏已有 `env(safe-area-inset-top)` 适配）
- 构建：Bun + SDK 打包脚本 → Vite（`npm run build`）
- 删除未使用的 drizzle/SQLite schema 与 `recharts` 依赖
- 单源请求超时从 9 秒改为 6 秒（Vercel Hobby 函数最长执行 10 秒）

## 功能

- 标的：BTC / ETH / SOL；周期：15m / 1h / 4h
- K 线、成交量、EMA、布林带
- ADX / DI、ATR 分位
- Swing 高低点、BOS（结构突破）识别
- RSI 背离标记
- 支撑阻力与流动性区
- 仓位计算器（固定风险法，不给方向）

## 数据源（自动降级）

`api/market-data.ts` 按顺序尝试，失败自动降级：

1. Binance 合约 K 线 → 2. Binance 现货 K 线 → 3. Bybit V5 → 4. Kraken OHLC → 5. CoinGecko

## 本地开发

```
npm install
npm run dev      # 前端，http://localhost:5173（API 需 vercel dev 或已部署的后端）
```

## 部署到 Vercel

1. 在 Vercel 新建项目，关联本仓库，选择 `vercel-port` 分支
2. Framework 选择 Vite（`vercel.json` 已配好构建命令与输出目录）
3. 无需环境变量，直接部署

`/api/market-data.ts` 会被自动识别为 serverless function。

## 免责

本项目仅为市场数据可视化工具，不提供交易信号，不构成任何投资建议。加密货币交易风险极高，请自行判断。
