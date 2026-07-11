// 图表创建与主题（对数坐标、中文、全范围可缩放、狼波指数副图区）。
// 横轴以区块高度为主：内置时间轴隐藏，底部刻度（高度 + ≈日期）由
// main.js 的自绘轴条负责。
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
      fontSize: 11,
      panes: { separatorColor: COLORS.scaleBorder, enableResize: true },
    },
    grid: {
      // 只保留极淡的横向网格：纵向网格与减半日/今日竖线视觉冲突
      vertLines: { visible: false },
      horzLines: { color: COLORS.grid },
    },
    rightPriceScale: { borderColor: COLORS.scaleBorder },
  };
}

function seriesThemeOptions() {
  return {
    upColor: COLORS.up,
    downColor: COLORS.down,
    wickUpColor: COLORS.up,
    wickDownColor: COLORS.down,
    borderVisible: false,
    // 价格格式挂在系列上而非 localization.priceFormatter：
    // 后者是全图表生效，会把副图区 0~1 的指数读数也格式化成价格
    priceFormat: { type: 'custom', formatter: priceFormatter, minMove: 0.01 },
  };
}

function phaseThemeOptions() {
  return { color: COLORS.phase };
}

function lineThemeOptions() {
  return { color: COLORS.up };
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
      visible: false, // 底部刻度轴由自绘的区块轴条接管
      // 默认 minBarSpacing 0.5 会让 ~5300 根 K 线无法一屏放下，必须调小
      minBarSpacing: 0.05,
    },
    localization: { locale: 'zh-CN' },
  });

  const series = chart.addSeries(LWC.CandlestickSeries, seriesThemeOptions());

  // 折线模式的价格系列（收盘价），与 K 线切换显示、共用右轴
  const lineSeries = chart.addSeries(LWC.LineSeries, {
    ...lineThemeOptions(),
    lineWidth: 1.5,
    visible: false,
    priceFormat: { type: 'custom', formatter: priceFormatter, minMove: 0.01 },
    priceLineVisible: true,
    lastValueVisible: true,
  });

  // 狼波着色模式：折线逐点着色（颜色 = 该处狼波指数，蓝 0 → 红 1），
  // 颜色随数据点传入，不走主题
  const waveLine = chart.addSeries(LWC.LineSeries, {
    lineWidth: 2.5,
    visible: false,
    priceFormat: { type: 'custom', formatter: priceFormatter, minMove: 0.01 },
    priceLineVisible: true,
    lastValueVisible: true,
  });

  // 狼波周期指数副图区（TradingView 风格的下方独立面板）：
  // 实线 = 已发生，虚线 = 预测段；右轴显示 0~1 小数读数
  const phaseFormat = { type: 'custom', formatter: (v) => v.toFixed(2), minMove: 0.01 };
  const phaseSolid = chart.addSeries(LWC.LineSeries, {
    ...phaseThemeOptions(),
    lineWidth: 1.5,
    priceFormat: phaseFormat,
    priceLineVisible: false,
    lastValueVisible: true,
  }, 1);
  const phaseDashed = chart.addSeries(LWC.LineSeries, {
    ...phaseThemeOptions(),
    lineWidth: 1.5,
    lineStyle: LWC.LineStyle.Dashed,
    priceFormat: phaseFormat,
    priceLineVisible: false,
    lastValueVisible: false,
  }, 1);
  // 副图的价格轴必须显式设为线性：chart 级 rightPriceScale 的对数模式
  // 会套到所有面板，0 值在对数轴上会导致折线被削顶
  // 指数恒在 0~1，上下只留极少留白，避免浪费副图空间
  phaseSolid.priceScale().applyOptions({
    mode: LWC.PriceScaleMode.Normal,
    scaleMargins: { top: 0.06, bottom: 0.05 },
  });

  // 主图 : 副图 ≈ 4 : 1
  try {
    const panes = chart.panes();
    panes[0].setStretchFactor(4);
    panes[1].setStretchFactor(1);
  } catch (e) {
    console.warn('副图高度设置失败（不影响功能）：', e);
  }

  return { chart, series, lineSeries, waveLine, phaseSolid, phaseDashed };
}

// 主题切换时刷新图表配色（标注由调用方重建）
export function applyChartTheme(chart, series, lineSeries, phaseSolid, phaseDashed) {
  chart.applyOptions(themeOptions());
  series.applyOptions(seriesThemeOptions());
  lineSeries.applyOptions(lineThemeOptions());
  phaseSolid.applyOptions(phaseThemeOptions());
  phaseDashed.applyOptions(phaseThemeOptions());
}

// 对数/线性切换
export function setLogScale(chart, useLog) {
  const LWC = window.LightweightCharts;
  chart.priceScale('right').applyOptions({
    mode: useLog ? LWC.PriceScaleMode.Logarithmic : LWC.PriceScaleMode.Normal,
  });
}
