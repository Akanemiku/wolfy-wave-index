// 入口编排：内置快照立即上屏 → 后台拉实时尾部 → 原地升级；
// 以及页面 UI（主题/范围/坐标/标注开关、OHLC 读数、周期状态栏）
import { DAY, BEAR_DAYS, COLORS, setTheme } from './config.js';
import { createChartAndSeries, applyChartTheme, setLogScale } from './chart.js';
import {
  loadSnapshot, fetchBitstampLive, fetchCoinbaseFallback,
  mergeCandles, fillGaps, extendWithWhitespace,
} from './data.js';
import { computePivots, buildAnnotations } from './pivots.js';
import { setSeriesData } from './primitives/base.js';

const $ = (id) => document.getElementById(id);
const fmtDate = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const fmtPrice = (p) => (p >= 100 ? Math.round(p).toLocaleString('en-US') : p.toFixed(2));
const fmtPct = (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;

const THEME_KEY = 'wolfy-theme';

function showNotice(text) {
  $('notice-text').textContent = text;
  $('notice').hidden = false;
}
$('notice-close').addEventListener('click', () => { $('notice').hidden = true; });

async function init() {
  // ── 主题初始化（在建图之前） ──
  let themeName = localStorage.getItem(THEME_KEY) || 'dark';
  setTheme(themeName);
  document.documentElement.dataset.theme = themeName;

  const LWC = window.LightweightCharts;
  const { chart, series } = createChartAndSeries($('chart'));

  // ── 状态 ──
  let attached = [];        // 当前挂载的标注 primitive
  let built = [];           // 最近一次构建的标注 primitive
  let annotOn = true;
  let logOn = true;
  let currentCandles = [];  // 最近一次渲染用的 K 线（含缺口占位）
  let currentPivots = [];
  let extendedLen = 0;
  let watermark = null;

  function makeWatermark() {
    try {
      watermark?.detach();
      watermark = LWC.createTextWatermark(chart.panes()[0], {
        horzAlign: 'center',
        vertAlign: 'center',
        lines: [{ text: '杀破狼 WolfyXBT', color: COLORS.watermark, fontSize: 44, fontStyle: 'bold' }],
      });
    } catch (e) {
      console.warn('水印创建失败（不影响功能）：', e);
      watermark = null;
    }
  }

  function render(rawCandles, { fit = false } = {}) {
    const candles = fillGaps(rawCandles);
    const pivots = computePivots(candles);
    const { primitives, extendTo } = buildAnnotations(pivots, candles);
    const extended = extendWithWhitespace(candles, extendTo);
    series.setData(extended);
    setSeriesData(extended);
    for (const p of attached) series.detachPrimitive(p);
    built = primitives;
    attached = annotOn ? primitives : [];
    for (const p of attached) series.attachPrimitive(p);

    currentCandles = candles;
    currentPivots = pivots;
    extendedLen = extended.length;
    idxCache = null;

    if (fit) {
      // 等一帧，确保 autoSize 已应用真实容器尺寸。不用 fitContent()：
      // 它锚定最后一根真实 K 线，会把 whitespace 预测区间挤出屏幕
      requestAnimationFrame(() => {
        chart.timeScale().setVisibleLogicalRange({ from: -5, to: extended.length + 5 });
      });
    }
    updateStats();
    updateLegend(null);
    window.wolfy = { chart, series, pivots, candles }; // 调试用
  }

  // ── 顶栏统计 ──
  function updateStats() {
    const real = currentCandles.filter((c) => c.open !== undefined);
    const last = real.at(-1);
    const prev = real.at(-2);
    if (!last) return;

    $('stat-price').textContent = `$${fmtPrice(last.close)}`;
    if (prev) {
      const chg = (last.close - prev.close) / prev.close;
      const el = $('stat-chg');
      el.textContent = fmtPct(chg);
      el.className = `chg ${chg >= 0 ? 'up' : 'down'}`;
    }

    const lastTop = currentPivots.at(-1);
    if (lastTop?.type === 'top') {
      const bearDay = Math.round((last.time - lastTop.time) / DAY);
      const remain = BEAR_DAYS - bearDay;
      $('stat-cycle').innerHTML = bearDay >= 0
        ? `熊市 第 <b>${bearDay}</b> / ${BEAR_DAYS} 天`
        : '—';
      $('stat-bottom').innerHTML = remain >= 0
        ? `距预测见底 <b>${remain}</b> 天（${fmtDate(lastTop.time + BEAR_DAYS * DAY).replaceAll('-', '/')}）`
        : `已超过预测见底日 <b>${-remain}</b> 天`;
    }
  }

  // ── 十字线 OHLC 读数 ──
  const timeIndex = () => new Map(currentCandles.map((c, i) => [c.time, i]));
  let idxCache = null;

  function prevRealClose(i) {
    for (let j = i - 1; j >= 0; j--) {
      if (currentCandles[j].open !== undefined) return currentCandles[j].close;
    }
    return null;
  }

  function updateLegend(candle) {
    let c = candle;
    if (!c) c = currentCandles.filter((x) => x.open !== undefined).at(-1);
    if (!c || c.open === undefined) return;
    if (!idxCache) idxCache = timeIndex();
    const i = idxCache.get(c.time);
    const prevClose = i !== undefined ? prevRealClose(i) : null;
    const chg = prevClose ? (c.close - prevClose) / prevClose : null;
    const dir = chg !== null && chg < 0 ? 'down' : 'up';
    $('legend').innerHTML =
      `${fmtDate(c.time).replaceAll('-', '/')}　`
      + `开 <b>${fmtPrice(c.open)}</b>　高 <b>${fmtPrice(c.high)}</b>　`
      + `低 <b>${fmtPrice(c.low)}</b>　收 <b>${fmtPrice(c.close)}</b>`
      + (chg !== null ? `　<span class="${dir}">${fmtPct(chg)}</span>` : '');
  }

  chart.subscribeCrosshairMove((param) => {
    const d = param?.time !== undefined ? param.seriesData.get(series) : null;
    updateLegend(d && d.open !== undefined ? { ...d, time: param.time } : null);
  });

  // ── 工具栏 ──
  const rangeButtons = [...document.querySelectorAll('#range-group button')];
  const setActiveRange = (btn) => rangeButtons.forEach((b) => b.classList.toggle('active', b === btn));

  function applyRange(name) {
    const real = currentCandles.filter((c) => c.open !== undefined);
    const first = currentCandles[0].time;
    const idxOf = (t) => (t - first) / DAY;
    if (name === 'all') {
      chart.timeScale().setVisibleLogicalRange({ from: -5, to: extendedLen + 5 });
    } else if (name === 'cycle') {
      const lastBottom = [...currentPivots].reverse().find((p) => p.type === 'bottom');
      const from = lastBottom ? idxOf(lastBottom.time) - 15 : 0;
      chart.timeScale().setVisibleLogicalRange({ from, to: extendedLen + 5 });
    } else if (name === '1y') {
      const lastIdx = idxOf(real.at(-1).time);
      chart.timeScale().setVisibleLogicalRange({ from: lastIdx - 370, to: lastIdx + 45 });
    }
  }

  rangeButtons.forEach((btn) => btn.addEventListener('click', () => {
    setActiveRange(btn);
    applyRange(btn.dataset.range);
  }));

  $('scale-toggle').addEventListener('click', () => {
    logOn = !logOn;
    setLogScale(chart, logOn);
    $('scale-toggle').textContent = logOn ? '对数' : '线性';
    $('scale-toggle').classList.toggle('active', logOn);
  });

  $('annot-toggle').addEventListener('click', () => {
    annotOn = !annotOn;
    if (annotOn) {
      for (const p of built) series.attachPrimitive(p);
      attached = built;
    } else {
      for (const p of attached) series.detachPrimitive(p);
      attached = [];
    }
    $('annot-toggle').classList.toggle('active', annotOn);
  });

  $('theme-toggle').addEventListener('click', () => {
    themeName = themeName === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, themeName);
    setTheme(themeName);
    document.documentElement.dataset.theme = themeName;
    applyChartTheme(chart, series);
    makeWatermark();
    render(currentCandles); // 重建标注以套用新配色（保留当前缩放）
  });

  // ── 数据：快照立即渲染，实时尾部后台升级 ──
  let snapshot;
  try {
    snapshot = await loadSnapshot();
  } catch (e) {
    console.error(e);
    $('loading-text').textContent = `历史数据加载失败：${e.message}`;
    return;
  }
  render(snapshot, { fit: true });
  makeWatermark();
  $('loading').hidden = true;

  const sinceTs = snapshot.at(-1).time;
  let live = null;
  try {
    live = await fetchBitstampLive(sinceTs);
  } catch (e1) {
    console.warn('Bitstamp 实时数据失败，尝试 Coinbase：', e1);
    try {
      live = await fetchCoinbaseFallback(sinceTs);
    } catch (e2) {
      console.warn('Coinbase 备用源也失败：', e2);
    }
  }

  if (live && live.length) {
    render(mergeCandles(snapshot, live));
  } else {
    showNotice(`实时数据加载失败，当前显示截至 ${fmtDate(sinceTs)} 的历史数据。`);
  }
  console.table(currentPivots.map((p) => ({ 类型: p.type === 'top' ? '牛顶' : '熊底', 日期: fmtDate(p.time), 价格: p.price })));
}

init().catch((e) => {
  console.error(e);
  $('loading-text').textContent = `页面初始化失败：${e.message}`;
});
