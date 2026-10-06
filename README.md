# 市场结构终端 / Crypto Market Structure Terminal

加密货币市场结构查看终端：多币种、多周期 K 线与技术指标，叠加市场结构识别（Swing / BOS）、动量背离、支撑阻力与流动性区，以及仓位计算器。

**原则：只呈现市场结构，不输出任何做多 / 做空交易信号，不构成投资建议。**

## 功能

- 标的：BTC / ETH / SOL；周期：15m / 1h / 4h
- K 线、成交量、EMA、布林带
- ADX / DI、ATR 分位
- Swing 高低点、BOS（结构突破）识别
- RSI 背离标记
- 支撑阻力与流动性区
- 仓位计算器（基于 ATR 的中性风险测算，不给方向）

## 数据源（自动降级）

服务端按顺序尝试，失败自动降级到下一源：

1. Binance 合约 K 线 → 2. Binance 现货 K 线 → 3. Bybit V5 → 4. Kraken OHLC → 5. CoinGecko

## 技术栈

- React 19 + TypeScript，lightweight-charts / recharts，Tailwind CSS 4
- Bun runtime，drizzle-orm
- 客户端通过 typed RPC action 调用服务端（`server/src/actions.ts`），指标与结构全部在客户端本地计算

## 运行说明

本项目最初构建于 Hatch space 运行时，依赖内部包 `@hatch/space-sdk`（未发布到 npm），因此**无法**仅靠 `bun install` 在本仓库独立运行。此处发布源码供参考与二次开发。

```
bun install
bun run build
```

## 免责

本项目仅为市场数据可视化工具，不提供交易信号，不构成任何投资建议。加密货币交易风险极高，请自行判断。
