// 入口编排：内置快照立即上屏 → 后台拉实时尾部 → 原地升级；
// 页面 UI（周期/主题/范围/坐标/标注开关、OHLC 读数、周期状态栏、顶部标签轴）
import { DAY, BEAR_DAYS, COLORS, setTheme } from './config.js';
import { createChartAndSeries, applyChartTheme, setLogScale } from './chart.js';
import {
  loadSnapshot, fetchBitstampLive, fetchCoinbaseFallback,
  mergeCandles, fillGaps, aggregate, extendBars,
} from './data.js';
import { computePivots, buildAnnotations } from './pivots.js';
import { setSeriesData, timeToLogical, logicalToX } from './primitives/base.js';

const $ = (id) => document.getElementById(id);
const fmtDate = (t) => new Date(t * 1000).toISOString().slice(0, 10);
// 全站统一的日期显示格式：DD/MM/YYYY
const fmtDMY = (t) => {
  const d = new Date(t * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};
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
  let attached = [];      // 当前挂载的标注 primitive
  let built = [];         // 最近一次构建的标注 primitive
  let annotOn = true;
  let logOn = true;
  let timeframe = 'day';  // 'day' | 'week' | 'month'
  let activeRange = 'all';
  let daily = [];         // fillGaps 后的日线（标注/枢轴/统计的数据源）
  let dailyReal = [];     // 仅真实日线
  let bars = [];          // 当前周期 bars + whitespace（图表数据源）
  let pivots = [];
  let axisMarks = [];     // 顶部标签轴条目（含 DOM 元素）
  let idxCache = null;
  let watermark = null;

  // ── 顶部标签轴 ──
  const topAxis = $('top-axis');

  function positionAxisMarks() {
    const width = chart.timeScale().width();
    for (const m of axisMarks) {
      const x = logicalToX(chart, timeToLogical(m.time));
      const show = x !== null && x >= 0 && x <= width;
      m.el.hidden = !show;
      m.tick.hidden = !show;
      if (show) {
        m.el.style.left = `${x}px`;
        m.tick.style.left = `${x}px`;
      }
    }
  }

  function renderAxisMarks(marks) {
    topAxis.textContent = '';
    axisMarks = marks.map((m) => {
      const el = document.createElement('span');
      el.className = 'ax-label';
      el.textContent = m.label;
      el.style.color = m.color;
      const tick = document.createElement('i');
      tick.className = 'ax-tick';
      tick.style.background = m.color;
      topAxis.append(el, tick);
      return { ...m, el, tick };
    });
    positionAxisMarks();
  }

  chart.timeScale().subscribeVisibleLogicalRangeChange(positionAxisMarks);
  window.addEventListener('resize', positionAxisMarks);

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

  // ── 渲染管线 ──
  // newRawDaily 为 null 时复用现有日线（周期/主题切换）；
  // 枢轴与标注永远基于日线计算，图表数据按当前周期聚合
  function render(newRawDaily, { fit = false } = {}) {
    if (newRawDaily) {
      daily = fillGaps(newRawDaily);
      dailyReal = daily.filter((c) => c.open !== undefined);
      pivots = computePivots(daily);
    }
    const { primitives, axisMarks: marks, extendTo } = buildAnnotations(pivots, daily);
    bars = extendBars(aggregate(daily, timeframe), extendTo, timeframe);
    series.setData(bars);
    setSeriesData(bars);
    for (const p of attached) series.detachPrimitive(p);
    built = primitives;
    attached = annotOn ? primitives : [];
    for (const p of attached) series.attachPrimitive(p);
    idxCache = null;
    renderAxisMarks(marks);
    if (fit) {
      // 等一帧，确保 autoSize 已应用真实容器尺寸
      requestAnimationFrame(() => {
        applyRange(activeRange);
        positionAxisMarks();
      });
    }
    updateStats();
    updateLegend(null);
    window.wolfy = { chart, series, pivots, candles: daily, bars }; // 调试用
  }

  // ── 顶栏统计（始终基于日线） ──
  function updateStats() {
    const last = dailyReal.at(-1);
    const prev = dailyReal.at(-2);
    if (!last) return;

    $('stat-price').textContent = `$${fmtPrice(last.close)}`;
    if (prev) {
      const chg = (last.close - prev.close) / prev.close;
      const el = $('stat-chg');
      el.textContent = fmtPct(chg);
      el.className = `chg ${chg >= 0 ? 'up' : 'down'}`;
    }

    const lastTop = pivots.at(-1);
    if (lastTop?.type === 'top') {
      const bearDay = Math.round((last.time - lastTop.time) / DAY);
      const remain = BEAR_DAYS - bearDay;
      $('stat-cycle').innerHTML = bearDay >= 0
        ? `熊市 第 <b>${bearDay}</b> / ${BEAR_DAYS} 天`
        : '—';
      $('stat-bottom').innerHTML = remain >= 0
        ? `距预测见底 <b>${remain}</b> 天（${fmtDMY(lastTop.time + BEAR_DAYS * DAY)}）`
        : `已超过预测见底日 <b>${-remain}</b> 天`;
    }
  }

  // ── 十字线 OHLC 读数（基于当前周期 bars） ──
  function prevRealClose(i) {
    for (let j = i - 1; j >= 0; j--) {
      if (bars[j].open !== undefined) return bars[j].close;
    }
    return null;
  }

  function updateLegend(bar) {
    let c = bar;
    if (!c) c = [...bars].reverse().find((x) => x.open !== undefined);
    if (!c || c.open === undefined) return;
    if (!idxCache) idxCache = new Map(bars.map((x, i) => [x.time, i]));
    const i = idxCache.get(c.time);
    const prevClose = i !== undefined ? prevRealClose(i) : null;
    const chg = prevClose ? (c.close - prevClose) / prevClose : null;
    const dir = chg !== null && chg < 0 ? 'down' : 'up';
    $('legend').innerHTML =
      `${fmtDMY(c.time)}　`
      + `开 <b>${fmtPrice(c.open)}</b>　高 <b>${fmtPrice(c.high)}</b>　`
      + `低 <b>${fmtPrice(c.low)}</b>　收 <b>${fmtPrice(c.close)}</b>`
      + (chg !== null ? `　<span class="${dir}">${fmtPct(chg)}</span>` : '');
  }

  chart.subscribeCrosshairMove((param) => {
    const d = param?.time !== undefined ? param.seriesData.get(series) : null;
    updateLegend(d && d.open !== undefined ? { ...d, time: param.time } : null);
  });

  // ── 范围预设（用时间→逻辑坐标换算，任何周期下都成立） ──
  function applyRange(name) {
    const last = dailyReal.at(-1);
    if (!last) return;
    if (name === 'cycle') {
      const lastBottom = [...pivots].reverse().find((p) => p.type === 'bottom');
      const from = lastBottom ? timeToLogical(lastBottom.time - 30 * DAY) : -3;
      chart.timeScale().setVisibleLogicalRange({ from, to: bars.length + 3 });
    } else if (name === '1y') {
      chart.timeScale().setVisibleLogicalRange({
        from: timeToLogical(last.time - 365 * DAY),
        to: timeToLogical(last.time + 45 * DAY),
      });
    } else {
      chart.timeScale().setVisibleLogicalRange({ from: -3, to: bars.length + 3 });
    }
  }

  // ── 工具栏 ──
  const tfButtons = [...document.querySelectorAll('#tf-group button')];
  tfButtons.forEach((btn) => btn.addEventListener('click', () => {
    if (btn.dataset.tf === timeframe) return;
    timeframe = btn.dataset.tf;
    tfButtons.forEach((b) => b.classList.toggle('active', b === btn));
    render(null);
    applyRange(activeRange);
  }));

  const rangeButtons = [...document.querySelectorAll('#range-group button')];
  rangeButtons.forEach((btn) => btn.addEventListener('click', () => {
    activeRange = btn.dataset.range;
    rangeButtons.forEach((b) => b.classList.toggle('active', b === btn));
    applyRange(activeRange);
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
    topAxis.style.visibility = annotOn ? '' : 'hidden';
    $('annot-toggle').classList.toggle('active', annotOn);
  });

  $('theme-toggle').addEventListener('click', () => {
    themeName = themeName === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, themeName);
    setTheme(themeName);
    document.documentElement.dataset.theme = themeName;
    applyChartTheme(chart, series);
    makeWatermark();
    render(null); // 重建标注/标签轴以套用新配色（保留当前缩放）
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
    showNotice(`实时数据加载失败，当前显示截至 ${fmtDMY(sinceTs)} 的历史数据。`);
  }
  console.table(pivots.map((p) => ({ 类型: p.type === 'top' ? '牛顶' : '熊底', 日期: fmtDate(p.time), 价格: p.price })));
}

init().catch((e) => {
  console.error(e);
  $('loading-text').textContent = `页面初始化失败：${e.message}`;
});
