// 图表创建与主题（对数坐标、中文、全范围可缩放）
import { COLORS, FONT } from './config.js';

const priceFormatter = (p) => (p >= 100
  ? Math.round(p).toLocaleString('en-US')
  : p.toFixed(2));

function themeOptions() {
  return {
    layout: {
      background: { type: 'solid', color: COLORS.chartBg },
      textColor: COLORS.chartText,
      fontFamily: FONT,
    },
    grid: {
      vertLines: { color: COLORS.grid },
      horzLines: { color: COLORS.grid },
    },
    rightPriceScale: { borderColor: COLORS.scaleBorder },
    timeScale: { borderColor: COLORS.scaleBorder },
  };
}

function seriesThemeOptions() {
  return {
    upColor: COLORS.up,
    downColor: COLORS.down,
    wickUpColor: COLORS.up,
    wickDownColor: COLORS.down,
    borderVisible: false,
  };
}

export function createChartAndSeries(container) {
  const LWC = window.LightweightCharts;

  const chart = LWC.createChart(container, {
    autoSize: true,
    ...themeOptions(),
    rightPriceScale: {
      mode: LWC.PriceScaleMode.Logarithmic,
      borderColor: COLORS.scaleBorder,
      scaleMargins: { top: 0.06, bottom: 0.04 },
    },
    timeScale: {
      borderColor: COLORS.scaleBorder,
      // 默认 minBarSpacing 0.5 会让 ~5300 根 K 线无法一屏放下，必须调小
      minBarSpacing: 0.05,
    },
    localization: { locale: 'zh-CN', priceFormatter },
  });

  const series = chart.addSeries(LWC.CandlestickSeries, seriesThemeOptions());

  return { chart, series };
}

// 主题切换时刷新图表配色（标注由调用方重建）
export function applyChartTheme(chart, series) {
  chart.applyOptions(themeOptions());
  series.applyOptions(seriesThemeOptions());
}

// 对数/线性切换
export function setLogScale(chart, useLog) {
  const LWC = window.LightweightCharts;
  chart.priceScale('right').applyOptions({
    mode: useLog ? LWC.PriceScaleMode.Logarithmic : LWC.PriceScaleMode.Normal,
  });
}
