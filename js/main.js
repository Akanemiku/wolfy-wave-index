// 入口编排：内置快照立即上屏 → 后台拉实时尾部 → 原地升级；
// 页面 UI（区块主轴 + 底部「高度/≈日期」双行刻度轴、分桶/主题/坐标/标注开关、
// OHLC 读数、周期状态栏、顶部标签轴）
import { DAY, BLOCK_BUCKETS, COLORS, setTheme } from './config.js';
import { createChartAndSeries, applyChartTheme, setLogScale } from './chart.js';
import {
  loadSnapshot, fetchBitstampLive, fetchCoinbaseFallback,
  mergeCandles, fillGaps,
} from './data.js';
import {
  loadHeightAnchors, fetchTipAnchor, heightAt, timeAtHeight,
  aggregateByBlocks, extendBlocks, waveIndexAt, waveHorizonHeight,
} from './blocks.js';
import { computePivots, buildAnnotations } from './pivots.js';
import { t, setLang, I18N } from './i18n.js';
import { setSeriesData, timeToLogical, logicalToX } from './primitives/base.js';

const $ = (id) => document.getElementById(id);
const fmtDate = (t) => new Date(t * 1000).toISOString().slice(0, 10);
// 全站统一的日期显示格式：DD/MM/YYYY
const fmtDMY = (t) => {
  const d = new Date(t * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};
// 粗刻度用的月份格式：MM/YYYY
const fmtMY = (t) => {
  const d = new Date(t * 1000);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
};
const fmtPrice = (p) => (p >= 100 ? Math.round(p).toLocaleString('en-US') : p.toFixed(2));
const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
const fmtPct = (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;

const THEME_KEY = 'wolfy-theme';
const LANG_KEY = 'wolfy-lang';

function showNotice(text) {
  $('notice-text').textContent = text;
  $('notice').hidden = false;
}
$('notice-close').addEventListener('click', () => { $('notice').hidden = true; });

async function init() {
  // ── 主题与语言初始化（在建图之前） ──
  let themeName = localStorage.getItem(THEME_KEY) || 'dark';
  setTheme(themeName);
  document.documentElement.dataset.theme = themeName;
  setLang(localStorage.getItem(LANG_KEY) || 'zh');
  $('loading-text').textContent = t('loading');

  // ── 状态 ──
  let attached = [];       // 当前挂载的标注 primitive（主图）
  let built = [];          // 最近一次构建的标注 primitive（主图）
  let attachedPhase = [];  // 当前挂载的副图标注（贯穿的色带与减半线）
  let builtPhase = [];     // 最近一次构建的副图标注
  let annotOn = true;
  let logOn = true;
  let timeframe = 'day';   // 分桶粒度键：day=144块 week=1,008块 month=4,368块
  let daily = [];          // fillGaps 后的日线（枢轴/统计的数据源）
  let dailyReal = [];      // 仅真实日线
  let bars = [];           // 按块分桶的 bars + whitespace（图表数据源，time=桶起始高度）
  let pivots = [];
  let meta = null;         // { topPos, todayPos, predictedEnd }（单位：高度）
  let axisMarks = [];      // 顶部标签轴条目（含 DOM 元素）
  let idxCache = null;
  let tipHeight = null;    // 当前链上高度（后台获取）
  let watermark = null;
  let paneTitle = null;    // 副图区标题（狼波周期指数，含跟随十字线的读数）
  let waveNow = null;      // 当前（今日）狼波指数值，十字线移开时回落显示

  const LWC = window.LightweightCharts;
  const { chart, series, phaseSolid, phaseDashed } = createChartAndSeries($('chart'));

  // ── 顶部标签轴 ──
  const topAxis = $('top-axis');

  // 绘图区宽度。不能用 timeScale().width()：内置时间轴已隐藏，它返回 0
  function paneWidth() {
    try {
      return chart.paneSize().width;
    } catch {
      return $('chart').clientWidth;
    }
  }

  function positionAxisMarks() {
    const width = paneWidth();
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

  // ── 底部区块刻度轴（主行：高度；副行：对应≈日期） ──
  const blockAxis = $('block-axis');
  const bxCursor = $('bx-cursor');
  const TICK_STEPS = [1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000];

  // 逻辑坐标 → 高度（bars 反查 + 桶内插值），用于计算可见高度范围
  function heightAtLogical(l) {
    if (bars.length < 2) return null;
    const i = Math.max(0, Math.min(bars.length - 2, Math.floor(l)));
    const t0 = bars[i].time;
    const t1 = bars[i + 1].time;
    return t0 + (l - i) * (t1 - t0);
  }

  function renderBlockAxis() {
    const range = chart.timeScale().getVisibleLogicalRange();
    const width = paneWidth();
    if (!range || !width) return;
    const hFrom = heightAtLogical(range.from);
    const hTo = heightAtLogical(range.to);
    if (hFrom === null || hTo === null || hTo <= hFrom) return;
    const pxPerBlock = width / (hTo - hFrom);
    const step = TICK_STEPS.find((s) => s * pxPerBlock >= 96) ?? TICK_STEPS.at(-1);
    const fmtTickDate = step >= 20000 ? fmtMY : fmtDMY; // 粗刻度只标到月
    for (const el of [...blockAxis.querySelectorAll('.bx-label, .bx-date, .bx-tick')]) el.remove();
    for (let h = Math.ceil(hFrom / step) * step; h <= hTo; h += step) {
      const x = logicalToX(chart, timeToLogical(h));
      if (x === null || x < 0 || x > width) continue;
      const tick = document.createElement('i');
      tick.className = 'bx-tick';
      tick.style.left = `${x}px`;
      const label = document.createElement('span');
      label.className = 'bx-label';
      label.textContent = fmtInt(h);
      label.style.left = `${x}px`;
      const date = document.createElement('span');
      date.className = 'bx-date';
      date.textContent = `≈${fmtTickDate(timeAtHeight(h))}`;
      date.style.left = `${x}px`;
      blockAxis.append(tick, label, date);
    }
  }

  // 十字线在底轴上的浮标：高度 · ≈日期
  function updateAxisCursor(h) {
    if (h === null) {
      bxCursor.hidden = true;
      return;
    }
    const x = logicalToX(chart, timeToLogical(h));
    const width = paneWidth();
    if (x === null || x < 0 || x > width) {
      bxCursor.hidden = true;
      return;
    }
    bxCursor.textContent = `${fmtInt(h)} · ≈${fmtDMY(timeAtHeight(h))}`;
    bxCursor.style.left = `${x}px`;
    bxCursor.hidden = false;
  }

  chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
    positionAxisMarks();
    renderBlockAxis();
  });
  window.addEventListener('resize', () => {
    positionAxisMarks();
    renderBlockAxis();
  });

  function makeWatermark() {
    try {
      watermark?.detach();
      const [big, small] = t('watermark');
      watermark = LWC.createTextWatermark(chart.panes()[0], {
        horzAlign: 'center',
        vertAlign: 'center',
        lines: [
          { text: big, color: COLORS.watermark, fontSize: 44, fontStyle: 'bold' },
          ...(small ? [{ text: small, color: COLORS.watermark, fontSize: 18 }] : []),
        ],
      });
      paneTitle?.detach();
      paneTitle = LWC.createTextWatermark(chart.panes()[1], {
        horzAlign: 'left',
        vertAlign: 'top',
        lines: [{ text: '狼波周期指数 Wolfy Wave Index', color: COLORS.phase, fontSize: 11 }],
      });
      updateWaveTitle();
    } catch (e) {
      console.warn('水印创建失败（不影响功能）：', e);
      watermark = null;
    }
  }

  // 副图区标题行的实时读数：十字线指向的位置值，或当前值
  function updateWaveTitle(v = waveNow) {
    if (!paneTitle || v === null) return;
    try {
      paneTitle.applyOptions({
        lines: [{
          text: t('paneTitle', v.toFixed(2)),
          color: COLORS.phase,
          fontSize: 11,
        }],
      });
    } catch { /* 面板重建瞬间可能失效，忽略 */ }
  }

  // ── 渲染管线 ──
  // newRawDaily 为 null 时复用现有日线（分桶/主题切换）；
  // 枢轴基于日线计算，图表数据按当前粒度分桶（time = 桶起始高度）
  function render(newRawDaily, { fit = false } = {}) {
    if (newRawDaily) {
      daily = fillGaps(newRawDaily);
      dailyReal = daily.filter((c) => c.open !== undefined);
      pivots = computePivots(daily);
    }
    // 未来视界：延伸到「下下个」理论熊底，铺出完整的下一轮周期
    //（未来的减半区块与狼波周期都是可直接推算的）
    const hNow = tipHeight ?? heightAt(dailyReal.at(-1).time + DAY);
    const horizonH = waveHorizonHeight(hNow);
    const bucket = BLOCK_BUCKETS[timeframe];
    const ann = buildAnnotations(pivots, daily, hNow, horizonH);
    bars = extendBlocks(aggregateByBlocks(daily, bucket), ann.extendTo, bucket);
    meta = ann.meta;
    series.setData(bars);
    setSeriesData(bars);
    // 狼波周期指数：高度的纯函数，按 bars 的桶起始高度采样。
    // 实线 = 已发生，虚线 = 未来段
    const solidData = [];
    const dashedData = [];
    for (const b of bars) {
      const v = waveIndexAt(b.time);
      (b.time <= ann.meta.todayPos ? solidData : dashedData).push({ time: b.time, value: v });
    }
    if (solidData.length && dashedData.length) dashedData.unshift(solidData.at(-1));
    phaseSolid.setData(solidData);
    phaseDashed.setData(dashedData);
    waveNow = waveIndexAt(hNow);
    updateWaveTitle();
    for (const p of attached) series.detachPrimitive(p);
    built = ann.primitives;
    attached = annotOn ? ann.primitives : [];
    for (const p of attached) series.attachPrimitive(p);
    for (const p of attachedPhase) phaseSolid.detachPrimitive(p);
    builtPhase = ann.phasePrimitives;
    attachedPhase = annotOn ? ann.phasePrimitives : [];
    for (const p of attachedPhase) phaseSolid.attachPrimitive(p);
    idxCache = null;
    renderAxisMarks(ann.axisMarks);
    if (fit) {
      // 等一帧，确保 autoSize 已应用真实容器尺寸
      requestAnimationFrame(() => {
        focusCurrent();
        positionAxisMarks();
        renderBlockAxis();
      });
    } else {
      renderBlockAxis();
    }
    updateStats();
    updateLegend(null);
    window.wolfy = { chart, series, phaseSolid, phaseDashed, pivots, candles: daily, bars, meta }; // 调试用
  }

  // ── 顶栏统计 ──
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
    if (!meta) return;

    const elapsed = meta.todayPos - meta.topPos;
    const total = meta.predictedEnd - meta.topPos;
    const remain = meta.predictedEnd - meta.todayPos;
    $('stat-cycle').innerHTML = elapsed >= 0
      ? t('statCycle', fmtInt(elapsed), fmtInt(total))
      : '—';
    $('stat-bottom').innerHTML = remain >= 0
      ? t('statBottom', fmtInt(remain), fmtInt(meta.predictedEnd))
      : t('statBottomOver', fmtInt(-remain));
  }

  // ── 十字线 OHLC 读数（基于当前 bars） ──
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
    const [o, h, l, cl] = t('legendOHLC');
    $('legend').innerHTML =
      `${t('legendHead', fmtInt(c.time), fmtDMY(timeAtHeight(c.time)))}　`
      + `${o} <b>${fmtPrice(c.open)}</b>　${h} <b>${fmtPrice(c.high)}</b>　`
      + `${l} <b>${fmtPrice(c.low)}</b>　${cl} <b>${fmtPrice(c.close)}</b>`
      + (chg !== null ? `　<span class="${dir}">${fmtPct(chg)}</span>` : '');
  }

  chart.subscribeCrosshairMove((param) => {
    const d = param?.time !== undefined ? param.seriesData.get(series) : null;
    updateLegend(d && d.open !== undefined ? { ...d, time: param.time } : null);
    // 狼波指数读数跟随十字线（未来虚线段也有值），移开时回落到当前值
    const w = param?.time !== undefined
      ? (param.seriesData.get(phaseSolid) ?? param.seriesData.get(phaseDashed))
      : null;
    updateWaveTitle(w ? w.value : waveNow);
    // 底轴浮标：十字线位置的高度与≈日期
    updateAxisCursor(param?.time !== undefined ? param.time : null);
  });

  // 默认视图聚焦当前周期：上一轮实际熊底 → 本轮预测见底
  //（未来的完整下一轮周期已铺在右侧，滚轮缩小即可查看）
  function focusCurrent() {
    const lastBottom = [...pivots].reverse().find((p) => p.type === 'bottom');
    if (!lastBottom || !meta) return;
    chart.timeScale().setVisibleLogicalRange({
      from: timeToLogical(heightAt(lastBottom.time)) - 15,
      to: timeToLogical(meta.predictedEnd) + 20,
    });
  }

  // ── 工具栏 ──
  const tfButtons = [...document.querySelectorAll('#tf-group button')];
  tfButtons.forEach((btn) => btn.addEventListener('click', () => {
    if (btn.dataset.tf === timeframe) return;
    timeframe = btn.dataset.tf;
    tfButtons.forEach((b) => b.classList.toggle('active', b === btn));
    render(null);
    focusCurrent();
  }));

  // ── 语言：刷新所有静态文案（图内标注由 render 重建时套用） ──
  const TF_KEYS = { day: 'tfDay', week: 'tfWeek', month: 'tfMonth' };
  function applyStaticLang() {
    document.documentElement.lang = I18N.lang === 'zh' ? 'zh-CN' : 'en';
    $('brand-name').textContent = t('brand');
    tfButtons.forEach((b) => { b.textContent = t(TF_KEYS[b.dataset.tf]); });
    $('scale-toggle').textContent = logOn ? t('log') : t('linear');
    $('annot-toggle').textContent = t('marks');
    document.querySelectorAll('.lang-opt').forEach((b) => {
      b.classList.toggle('active', b.dataset.lang === I18N.lang);
    });
    $('foot-data').textContent = t('footData');
    $('foot-theory').textContent = t('footTheory');
    $('foot-disclaimer').textContent = t('footDisclaimer');
  }
  applyStaticLang();

  document.querySelectorAll('.lang-opt').forEach((btn) => btn.addEventListener('click', () => {
    if (btn.dataset.lang === I18N.lang) return;
    setLang(btn.dataset.lang);
    localStorage.setItem(LANG_KEY, I18N.lang);
    applyStaticLang();
    makeWatermark();
    render(null); // 重建标注/标签轴/读数以套用新语言（保留当前缩放）
  }));

  $('scale-toggle').addEventListener('click', () => {
    logOn = !logOn;
    setLogScale(chart, logOn);
    $('scale-toggle').textContent = logOn ? t('log') : t('linear');
    $('scale-toggle').classList.toggle('active', logOn);
  });

  $('annot-toggle').addEventListener('click', () => {
    annotOn = !annotOn;
    if (annotOn) {
      for (const p of built) series.attachPrimitive(p);
      attached = built;
      for (const p of builtPhase) phaseSolid.attachPrimitive(p);
      attachedPhase = builtPhase;
    } else {
      for (const p of attached) series.detachPrimitive(p);
      attached = [];
      for (const p of attachedPhase) phaseSolid.detachPrimitive(p);
      attachedPhase = [];
    }
    topAxis.style.visibility = annotOn ? '' : 'hidden';
    $('annot-toggle').classList.toggle('active', annotOn);
  });

  $('theme-toggle').addEventListener('click', () => {
    themeName = themeName === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, themeName);
    setTheme(themeName);
    document.documentElement.dataset.theme = themeName;
    applyChartTheme(chart, series, phaseSolid, phaseDashed);
    makeWatermark();
    render(null); // 重建标注/标签轴以套用新配色（保留当前缩放）
  });

  // ── 数据：快照与高度锚点立即渲染，实时尾部与链上高度后台升级 ──
  let snapshot;
  try {
    [snapshot] = await Promise.all([loadSnapshot(), loadHeightAnchors()]);
  } catch (e) {
    console.error(e);
    $('loading-text').textContent = t('loadFailData', e.message);
    return;
  }
  render(snapshot, { fit: true });
  makeWatermark();
  $('loading').hidden = true;

  const sinceTs = snapshot.at(-1).time;
  const [liveRes, tipRes] = await Promise.allSettled([
    (async () => {
      try {
        return await fetchBitstampLive(sinceTs);
      } catch (e1) {
        console.warn('Bitstamp 实时数据失败，尝试 Coinbase：', e1);
        return fetchCoinbaseFallback(sinceTs);
      }
    })(),
    fetchTipAnchor(),
  ]);

  if (tipRes.status === 'fulfilled') {
    tipHeight = tipRes.value;
  } else {
    console.warn('链上高度获取失败，按锚点外推：', tipRes.reason);
  }

  if (liveRes.status === 'fulfilled' && liveRes.value.length) {
    render(mergeCandles(snapshot, liveRes.value));
  } else {
    if (liveRes.status === 'rejected') console.warn('Coinbase 备用源也失败：', liveRes.reason);
    render(null); // 至少套用 tipHeight
    showNotice(t('noticeStale', fmtDMY(sinceTs)));
  }
  console.table(pivots.map((p) => ({ 类型: p.type === 'top' ? '牛顶' : '熊底', 日期: fmtDate(p.time), 价格: p.price, 高度: heightAt(p.time) })));
}

init().catch((e) => {
  console.error(e);
  $('loading-text').textContent = t('loadFailInit', e.message);
});
