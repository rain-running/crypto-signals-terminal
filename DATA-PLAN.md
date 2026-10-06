# Data Plan

## Context provenance
- “不再给出任何做多/做空交易信号，只客观呈现市场结构与市场状态，辅助交易者自己做判断。”（当前请求；决定全站只展示结构、指标和中性风险计算，不给方向建议）
- “15 分钟简单指标规则没有找到稳健有效的信号。”（父会话；解释为什么将焦点放到可核验的结构与市场状态，而非机械化结论）
- “数据源：浏览器端按顺序尝试 Binance 合约 → Binance 现货 → Bybit → Kraken → CoinGecko，失败自动降级。”（当前请求；在平台约束下由读取 action 执行同样的顺序降级，客户端只调用 typed action）

## Tested sources
### Binance Futures Klines
**Used by**: `getMarketData` 首选源
**Test command**: `curl -L -sS --max-time 15 -o /tmp/binance-futures.json -w '%{http_code}' 'https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=15m&limit=5'`
**Sample output**: HTTP 451；返回 `Service unavailable from a restricted location`。
**Processing**: 运行时若非 2xx 或数据格式不正确，立即降级到下一源；不将错误数据渲染为行情。

### Binance Spot Klines
**Used by**: `getMarketData` 第二顺位
**Test command**: `curl -L -sS --max-time 15 -o /tmp/binance-spot.json -w '%{http_code}' 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=5'`
**Sample output**: HTTP 451；同样返回受地区限制消息。
**Processing**: 失败自动降级。

### Bybit V5 Market Kline
**Used by**: `getMarketData` 第三顺位
**Test command**: `curl -L -sS --max-time 15 -o /tmp/bybit.json -w '%{http_code}' 'https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=15&limit=5'`
**Sample output**: HTTP 403；CloudFront 地区限制。
**Processing**: 失败自动降级；成功时把倒序数据转换为时间正序 OHLCV。

### Kraken OHLC
**Used by**: `getMarketData` 第四顺位、当前实测可用源
**Test command**: `curl -L -sS --max-time 15 -o /tmp/kraken.json -w '%{http_code}' 'https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=15'`
**Sample output**: HTTP 200，`error: []`；`result.XXBTZUSD` 返回时间、开高低收、VWAP、成交量与成交笔数，响应约 58KB。
**Processing**: BTC/ETH/SOL 映射到 XBTUSD/ETHUSD/SOLUSD；15m/1h/4h 映射到 15/60/240；剔除未完成/无效行，统一为 `{time,open,high,low,close,volume}`，按时间升序。

### CoinGecko OHLC
**Used by**: `getMarketData` 最终降级源
**Test command**: `curl -L -sS --max-time 15 -o /tmp/coingecko.json -w '%{http_code}' 'https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=1&precision=full'`
**Sample output**: HTTP 200；数组行包含毫秒时间戳与 open/high/low/close，响应约 4KB。
**Processing**: BTC/ETH/SOL 映射到 bitcoin/ethereum/solana；按周期选择天数，并与 market_chart 的成交量序列按最近时间配对；若成交量缺失，保留 K 线并明确显示成交量不可用，不伪造。

## Web-search sources
无。行情直接来自用户指定的公共 JSON API。

## Agent-task sources
无。

## Long-term data behavior
- **Refresh policy**: 页面打开或切换币种/周期时调用读取 action；提供显式刷新按钮。无 cron、无后台刷新 hook。
- **Growth**: 不写数据库；每次只返回有限的最近历史样本，客户端本地计算全部指标与结构。
- **Ordering**: 服务端统一为时间升序；关键价位客户端按距现价绝对距离升序。
- **Time semantics**: API epoch 时间作为市场时刻，图表按浏览者本地时区显示；顶栏显示源数据更新时间与实际来源。

## Imagery
Imagery not needed: 核心视觉是由真实 OHLCV 数据确定性生成的交互式金融图表，不涉及照片或插画主体。

## Rejected approaches
- **Tried**: 让浏览器直接跨域访问五个交易所 API。
  **Why rejected**: artifact 平台要求客户端只通过 typed actions 访问服务器；服务端 action 仍按用户要求的同一顺序尝试并自动降级，避免 CORS 与第三方浏览器依赖。
- **Tried**: 以 Binance 或 Bybit 作为当前环境唯一源。
  **Why rejected**: 实测分别为 HTTP 451 与 403；保留其优先顺序但必须自动降级。
- **Tried**: 在失败时生成演示行情。
  **Why rejected**: 会把模拟数据误呈现为实时市场数据；全部源失败时改为诚实错误态。
