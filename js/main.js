// 入口编排：内置快照立即上屏 → 后台拉实时尾部 → 原地升级
import { createChartAndSeries } from './chart.js';
import {
  loadSnapshot, fetchBitstampLive, fetchCoinbaseFallback,
  mergeCandles, fillGaps, extendWithWhitespace,
} from './data.js';
import { computePivots, buildAnnotations } from './pivots.js';
import { setSeriesData } from './primitives/base.js';

const $ = (id) => document.getElementById(id);
const fmtDate = (t) => new Date(t * 1000).toISOString().slice(0, 10);

function showNotice(text) {
  $('notice-text').textContent = text;
  $('notice').hidden = false;
}
$('notice-close').addEventListener('click', () => { $('notice').hidden = true; });

async function init() {
  const { chart, series } = createChartAndSeries($('chart'));
  let attached = [];

  function render(rawCandles, { fit = false } = {}) {
    const candles = fillGaps(rawCandles);
    const pivots = computePivots(candles);
    const { primitives, extendTo } = buildAnnotations(pivots, candles);
    const extended = extendWithWhitespace(candles, extendTo);
    series.setData(extended);
    setSeriesData(extended);
    for (const p of attached) series.detachPrimitive(p);
    attached = primitives;
    for (const p of primitives) series.attachPrimitive(p);
    if (fit) {
      // 等一帧，确保 autoSize 已应用真实容器尺寸。不用 fitContent()：
      // 它锚定最后一根真实 K 线，会把 whitespace 预测区间挤出屏幕
      requestAnimationFrame(() => {
        chart.timeScale().setVisibleLogicalRange({ from: -5, to: extended.length + 5 });
      });
    }
    window.wolfy = { chart, series, pivots, candles }; // 调试用
    return pivots;
  }

  // 1) 内置快照立即渲染，不被实时请求拖慢首屏
  let snapshot;
  try {
    snapshot = await loadSnapshot();
  } catch (e) {
    console.error(e);
    $('loading-text').textContent = `历史数据加载失败：${e.message}`;
    return;
  }
  render(snapshot, { fit: true });
  $('loading').hidden = true;

  // 2) 后台拉实时尾部（从快照末尾接续），成功后原地升级
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

  let pivots;
  if (live && live.length) {
    pivots = render(mergeCandles(snapshot, live));
  } else {
    pivots = window.wolfy.pivots;
    showNotice(`实时数据加载失败，当前显示截至 ${fmtDate(sinceTs)} 的历史数据。`);
  }
  console.table(pivots.map((p) => ({ 类型: p.type === 'top' ? '牛顶' : '熊底', 日期: fmtDate(p.time), 价格: p.price })));
}

init().catch((e) => {
  console.error(e);
  $('loading-text').textContent = `页面初始化失败：${e.message}`;
});
