# 杀破狼 WolfyXBT · 比特币四年周期

比特币四年周期理论的专业指标网站：完整 BTC 日线 K 线（2013 年至今，对数坐标，
可缩放/平移），图上刻有固定标注——牛市/熊市区间、减半日竖线、周期时长箭头、
牛顶标注，以及按 364 天规律推演的预测熊市区间（虚线）。标注只能看，不能改。

页面功能：日/周/月线切换、深/浅主题切换（默认深色）、对数/线性坐标切换、
标注显隐开关、十字线 OHLC 读数、顶栏实时价格与周期状态（熊市第 N 天、
距预测见底天数）。图表上方有一条与底部时间轴同风格的标签轴，专门容纳
「减半日」「今日」等事件文本，随缩放平移实时跟随。

## 本地运行

```bash
python3 -m http.server 8080
# 打开 http://localhost:8080
```

不能直接双击 index.html（file:// 下无法 fetch 本地数据文件）。

## 数据来源

- 历史快照：`data/btc-daily.json`（Bitstamp BTC/USD 日线，随仓库分发）
- 页面加载时从 Bitstamp 拉取最近 1000 天实时合并；失败则用 Coinbase 备用；
  再失败则只显示快照并提示横幅
- 快照覆盖最近 1000 天内都无需更新；想刷新运行：

```bash
node scripts/fetch-history.mjs   # 需 Node ≥ 18
```

## 调整标注

只需要改 [js/config.js](js/config.js)：

- 顶底**不是**硬编码日期——牛顶 = 搜索窗口内最高价那天、熊底 = 窗口内最低价那天，
  由实际行情自动算出（`PIVOT_WINDOWS` 定义粗略窗口）
- 减半日：`HALVINGS`
- 预测规律：`BEAR_DAYS`（熊市 364 天）
- 箭头文字：`ARROW_LABEL_MODE = 'fixed'`（周期理论数字）或 `'computed'`（实际天数）
- 配色：`THEMES.dark` / `THEMES.light`（想改红涨绿跌就交换 `up`/`down`）

## 部署

纯静态站，无构建步骤：

- **GitHub Pages**：推到 GitHub → Settings → Pages → main 分支根目录
- **Vercel**：导入仓库，Framework 选 "Other"，无需构建命令

## 技术栈

[TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) v5.2.0
（已内置于 `vendor/`，Apache-2.0），标注用 series primitives 实现（纯 Canvas 渲染，
无交互命中，天然只读）。无框架、无依赖、无构建。
