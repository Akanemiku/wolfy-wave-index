// 入口编排：加载数据 → 建图 → 算枢轴 → 刻标注
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
  if (location.protocol === 'file:') {
    $('loading-text').textContent =
      '不能直接双击打开本页面，请在项目目录运行 python3 -m http.server 8080 后访问 http://localhost:8080';
    return;
  }

  // 先建图（让 autoSize 的 ResizeObserver 有时间上报真实尺寸），再等数据
  const { chart, series } = createChartAndSeries($('chart'));

  const [snapRes, liveRes] = await Promise.allSettled([loadSnapshot(), fetchBitstampLive()]);
  if (snapRes.status === 'rejected') {
    console.error(snapRes.reason);
    $('loading-text').textContent = `历史数据加载失败：${snapRes.reason.message}`;
    return;
  }

  let candles = snapRes.value;
  let liveFailed = false;
  if (liveRes.status === 'fulfilled') {
    candles = mergeCandles(candles, liveRes.value);
  } else {
    console.warn('Bitstamp 实时数据失败，尝试 Coinbase：', liveRes.reason);
    try {
      candles = mergeCandles(candles, await fetchCoinbaseFallback());
    } catch (e) {
      console.warn('Coinbase 备用源也失败：', e);
      liveFailed = true;
    }
  }
  candles = fillGaps(candles);

  const pivots = computePivots(candles);
  console.table(pivots.map((p) => ({ 类型: p.type === 'top' ? '牛顶' : '熊底', 日期: fmtDate(p.time), 价格: p.price })));

  const { primitives, extendTo } = buildAnnotations(pivots, candles);
  const extended = extendWithWhitespace(candles, extendTo);

  series.setData(extended);
  setSeriesData(extended);
  for (const p of primitives) series.attachPrimitive(p);
  // 等一帧再设置可见范围，确保 autoSize 已应用真实容器尺寸。
  // 不用 fitContent()：rightOffset 锚定在最后一根真实 K 线上，会把 whitespace
  // 预测区间挤出屏幕；显式给全范围 + 两侧少量留白。
  requestAnimationFrame(() => {
    chart.timeScale().setVisibleLogicalRange({ from: -5, to: extended.length + 5 });
  });

  window.wolfy = { chart, series, pivots, candles }; // 调试用
  $('loading').hidden = true;
  if (liveFailed) {
    showNotice(`实时数据加载失败，当前显示截至 ${fmtDate(candles.at(-1).time)} 的历史数据。`);
  }
}

init().catch((e) => {
  console.error(e);
  $('loading-text').textContent = `页面初始化失败：${e.message}`;
});
