// 入口编排：内置快照立即上屏 → 后台拉实时尾部 → 原地升级；
// 页面 UI（时间/区块双横轴、周期/主题/坐标/标注开关、OHLC 读数、周期状态栏、
// 顶部标签轴、区块模式的自绘底部刻度轴）
import { DAY, BEAR_DAYS, BLOCK_BUCKETS, COLORS, setTheme } from './config.js';
import { createChartAndSeries, applyChartTheme, setLogScale } from './chart.js';
import {
  loadSnapshot, fetchBitstampLive, fetchCoinbaseFallback,
  mergeCandles, fillGaps, aggregate, extendBars,
} from './data.js';
import {
  loadHeightAnchors, fetchTipAnchor, heightAt, timeAtHeight,
  aggregateByBlocks, extendBlocks, waveIndexAt, waveHorizonHeight,
} from './blocks.js';
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
const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
const fmtPct = (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;

const THEME_KEY = 'wolfy-theme';
const TF_LABELS = {
  time: { day: '日线', week: '周线', month: '月线' },
  blocks: { day: '144 块', week: '1,008 块', month: '4,368 块' },
};

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

  // ── 状态（先于建图声明：图表的刻度格式化闭包会引用 axisMode） ──
  let attached = [];       // 当前挂载的标注 primitive（主图）
  let built = [];          // 最近一次构建的标注 primitive（主图）
  let attachedPhase = [];  // 当前挂载的副图标注（减半竖线的贯穿部分）
  let builtPhase = [];     // 最近一次构建的副图标注
  let annotOn = true;
  let logOn = true;
  let axisMode = 'time';   // 'time' | 'blocks'
  let timeframe = 'day';   // 'day' | 'week' | 'month'
  let daily = [];          // fillGaps 后的日线（标注/枢轴/统计的数据源）
  let dailyReal = [];      // 仅真实日线
  let bars = [];           // 当前横轴模式与粒度下的 bars + whitespace（图表数据源）
  let pivots = [];
  let meta = null;         // { topPos, todayPos, predictedEnd }（单位随模式）
  let axisMarks = [];      // 顶部标签轴条目（含 DOM 元素）
  let idxCache = null;
  let tipHeight = null;    // 当前链上高度（后台获取）
  let watermark = null;
  let paneTitle = null;    // 副图区标题（狼波周期指数，含跟随十字线的读数）
  let waveNow = null;      // 当前（今日）狼波指数值，十字线移开时回落显示

  const LWC = window.LightweightCharts;
  const { chart, series, phaseSolid, phaseDashed } =
    createChartAndSeries($('chart'), () => axisMode === 'blocks');

  // ── 顶部标签轴 ──
  const topAxis = $('top-axis');

  // 绘图区宽度。不能用 timeScale().width()：它量的是底部时间轴 UI 的宽度，
  // 区块模式下时间轴隐藏时返回 0
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

  // ── 区块模式的底部刻度轴（自绘；内置时间轴在区块模式下隐藏） ──
  const blockAxis = $('block-axis');
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
    if (axisMode !== 'blocks') return;
    const range = chart.timeScale().getVisibleLogicalRange();
    const width = paneWidth();
    if (!range || !width) return;
    const hFrom = heightAtLogical(range.from);
    const hTo = heightAtLogical(range.to);
    if (hFrom === null || hTo === null || hTo <= hFrom) return;
    const pxPerBlock = width / (hTo - hFrom);
    const step = TICK_STEPS.find((s) => s * pxPerBlock >= 90) ?? TICK_STEPS.at(-1);
    blockAxis.style.height = `${chart.timeScale().height()}px`;
    blockAxis.textContent = '';
    for (let h = Math.ceil(hFrom / step) * step; h <= hTo; h += step) {
      const x = logicalToX(chart, timeToLogical(h));
      if (x === null || x < 0 || x > width) continue;
      const el = document.createElement('span');
      el.className = 'bx-label';
      el.textContent = fmtInt(h);
      el.style.left = `${x}px`;
      const tick = document.createElement('i');
      tick.className = 'bx-tick';
      tick.style.left = `${x}px`;
      blockAxis.append(el, tick);
    }
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
      watermark = LWC.createTextWatermark(chart.panes()[0], {
        horzAlign: 'center',
        vertAlign: 'center',
        lines: [
          { text: '狼波周期指数', color: COLORS.watermark, fontSize: 44, fontStyle: 'bold' },
          { text: 'Wolfy Wave Index', color: COLORS.watermark, fontSize: 18 },
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
          text: `狼波周期指数 Wolfy Wave Index　${v.toFixed(2)}　（0 = 熊底 · 1 = 牛顶）`,
          color: COLORS.phase,
          fontSize: 11,
        }],
      });
    } catch { /* 面板重建瞬间可能失效，忽略 */ }
  }

  // ── 渲染管线 ──
  // newRawDaily 为 null 时复用现有日线（模式/周期/主题切换）；
  // 枢轴与标注永远基于日线计算，图表数据按当前横轴模式与粒度聚合
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
    let ann;
    if (axisMode === 'blocks') {
      const bucket = BLOCK_BUCKETS[timeframe];
      const blockCtx = { heightAt, today: hNow };
      ann = buildAnnotations(pivots, daily, blockCtx, horizonH);
      bars = extendBlocks(aggregateByBlocks(daily, bucket), ann.extendTo, bucket);
    } else {
      ann = buildAnnotations(pivots, daily, null, timeAtHeight(horizonH));
      bars = extendBars(aggregate(daily, timeframe), ann.extendTo, timeframe);
    }
    meta = ann.meta;
    series.setData(bars);
    setSeriesData(bars);
    // 狼波周期指数（纯区块制）：指数是高度的纯函数，时间视图先把日期换算成
    // 高度再取值，两种视图读数一致。采样点严格取自 bars 的时间键，
    // 不会向时间轴引入新的点位。实线 = 已发生，虚线 = 未来段
    const solidData = [];
    const dashedData = [];
    for (const b of bars) {
      const v = waveIndexAt(axisMode === 'blocks' ? b.time : heightAt(b.time));
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

    if (axisMode === 'blocks') {
      const elapsed = meta.todayPos - meta.topPos;
      const total = meta.predictedEnd - meta.topPos;
      const remain = meta.predictedEnd - meta.todayPos;
      $('stat-cycle').innerHTML = elapsed >= 0
        ? `熊市 第 <b>${fmtInt(elapsed)}</b> / ${fmtInt(total)} 块`
        : '—';
      $('stat-bottom').innerHTML = remain >= 0
        ? `距预测见底 <b>${fmtInt(remain)}</b> 块（高度 ${fmtInt(meta.predictedEnd)}）`
        : `已超过预测见底高度 <b>${fmtInt(-remain)}</b> 块`;
    } else {
      const bearDay = Math.round((meta.todayPos - meta.topPos) / DAY);
      const remain = BEAR_DAYS - bearDay;
      $('stat-cycle').innerHTML = bearDay >= 0
        ? `熊市 第 <b>${bearDay}</b> / ${BEAR_DAYS} 天`
        : '—';
      $('stat-bottom').innerHTML = remain >= 0
        ? `距预测见底 <b>${remain}</b> 天（${fmtDMY(meta.predictedEnd)}）`
        : `已超过预测见底日 <b>${-remain}</b> 天`;
    }
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
    const head = axisMode === 'blocks'
      ? `区块 ${fmtInt(c.time)}　≈${fmtDMY(timeAtHeight(c.time))}`
      : fmtDMY(c.time);
    $('legend').innerHTML =
      `${head}　`
      + `开 <b>${fmtPrice(c.open)}</b>　高 <b>${fmtPrice(c.high)}</b>　`
      + `低 <b>${fmtPrice(c.low)}</b>　收 <b>${fmtPrice(c.close)}</b>`
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
  });

  // 默认视图聚焦当前周期：上一轮实际熊底 → 本轮预测见底
  //（未来的完整下一轮周期已铺在右侧，滚轮缩小即可查看）
  function focusCurrent() {
    const lastBottom = [...pivots].reverse().find((p) => p.type === 'bottom');
    if (!lastBottom || !meta) return;
    const fromPos = axisMode === 'blocks' ? heightAt(lastBottom.time) : lastBottom.time;
    chart.timeScale().setVisibleLogicalRange({
      from: timeToLogical(fromPos) - 15,
      to: timeToLogical(meta.predictedEnd) + 20,
    });
  }

  // ── 工具栏 ──
  const tfButtons = [...document.querySelectorAll('#tf-group button')];
  const relabelTf = () => tfButtons.forEach((b) => { b.textContent = TF_LABELS[axisMode][b.dataset.tf]; });

  tfButtons.forEach((btn) => btn.addEventListener('click', () => {
    if (btn.dataset.tf === timeframe) return;
    timeframe = btn.dataset.tf;
    tfButtons.forEach((b) => b.classList.toggle('active', b === btn));
    render(null);
    focusCurrent();
  }));

  const axisButtons = [...document.querySelectorAll('#axis-group button')];
  axisButtons.forEach((btn) => btn.addEventListener('click', () => {
    if (btn.dataset.axis === axisMode) return;
    axisMode = btn.dataset.axis;
    axisButtons.forEach((b) => b.classList.toggle('active', b === btn));
    relabelTf();
    blockAxis.hidden = axisMode !== 'blocks';
    render(null);
    focusCurrent();
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
    $('loading-text').textContent = `历史数据加载失败：${e.message}`;
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
    showNotice(`实时数据加载失败，当前显示截至 ${fmtDMY(sinceTs)} 的历史数据。`);
  }
  console.table(pivots.map((p) => ({ 类型: p.type === 'top' ? '牛顶' : '熊底', 日期: fmtDate(p.time), 价格: p.price, 高度: heightAt(p.time) })));
}

init().catch((e) => {
  console.error(e);
  $('loading-text').textContent = `页面初始化失败：${e.message}`;
});
