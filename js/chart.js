// 图表创建与样式（对数坐标、中文、全范围可缩放）
import { COLORS, FONT } from './config.js';

export function createChartAndSeries(container) {
  const LWC = window.LightweightCharts;

  const chart = LWC.createChart(container, {
    autoSize: true,
    layout: {
      background: { type: 'solid', color: '#ffffff' },
      textColor: '#333333',
      fontFamily: FONT,
    },
    grid: {
      vertLines: { color: '#f0f3fa' },
      horzLines: { color: '#f0f3fa' },
    },
    rightPriceScale: {
      mode: LWC.PriceScaleMode.Logarithmic,
      borderColor: '#d1d4dc',
      scaleMargins: { top: 0.04, bottom: 0.03 },
    },
    timeScale: {
      borderColor: '#d1d4dc',
      // 默认 minBarSpacing 0.5 会让 ~5300 根 K 线无法一屏放下，必须调小
      minBarSpacing: 0.05,
    },
    localization: {
      locale: 'zh-CN',
      priceFormatter: (p) => (p >= 100
        ? Math.round(p).toLocaleString('en-US')
        : p.toFixed(2)),
    },
  });

  const series = chart.addSeries(LWC.CandlestickSeries, {
    upColor: COLORS.up,
    downColor: COLORS.down,
    wickUpColor: COLORS.up,
    wickDownColor: COLORS.down,
    borderVisible: false,
  });

  return { chart, series };
}
