// 区块高度轴：日期 ↔ 高度插值映射、按块数分桶聚合、时间轴延伸。
// 锚点 = 每 2016 块一次的难度调整 (timestamp, height)，桶内区块产出近似均匀，
// 分段线性插值的误差在宏观图上不可见（实测对照三次减半准确高度 ≤ 220 块）。
import { DAY } from './config.js';

const timeoutSignal = (ms) => {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
};

let _anchors = []; // [ts, height] 升序

export async function loadHeightAnchors() {
  const res = await fetch('./data/btc-heights.json', { signal: timeoutSignal(15000) });
  if (!res.ok) throw new Error(`高度锚点加载失败：HTTP ${res.status}`);
  _anchors = (await res.json()).anchors;
}

// 页面加载时补一个「现在」锚点，让最近两周的映射精确到当前链上高度；
// 失败则按尾部锚点的平均出块速度外推（约 144 块/天），不阻塞页面
export async function fetchTipAnchor() {
  const res = await fetch('https://mempool.space/api/blocks/tip/height', { signal: timeoutSignal(8000) });
  if (!res.ok) throw new Error(`mempool.space HTTP ${res.status}`);
  const tip = Number(await res.text());
  const nowSec = Math.floor(Date.now() / 1000);
  if (Number.isFinite(tip) && tip > _anchors.at(-1)[1] && nowSec > _anchors.at(-1)[0]) {
    _anchors.push([nowSec, tip]);
  }
  return tip;
}

function interp(pairs, x, xi, yi) {
  const n = pairs.length;
  if (x <= pairs[0][xi]) {
    const [a, b] = [pairs[0], pairs[1]];
    return a[yi] + ((x - a[xi]) / (b[xi] - a[xi])) * (b[yi] - a[yi]);
  }
  if (x >= pairs[n - 1][xi]) {
    const [a, b] = [pairs[n - 2], pairs[n - 1]];
    return b[yi] + ((x - b[xi]) / (b[xi] - a[xi])) * (b[yi] - a[yi]);
  }
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pairs[mid][xi] <= x) lo = mid;
    else hi = mid;
  }
  const [a, b] = [pairs[lo], pairs[lo + 1]];
  return a[yi] + ((x - a[xi]) / (b[xi] - a[xi])) * (b[yi] - a[yi]);
}

// UTC 秒 → 区块高度（分段线性，可外推）
export const heightAt = (ts) => Math.round(interp(_anchors, ts, 0, 1));
// 区块高度 → UTC 秒（逆映射，用于给高度标注近似日期）
export const timeAtHeight = (h) => Math.round(interp(_anchors, h, 1, 0));

// 日线 → 按固定块数分桶的 K 线。bar.time = 桶起始高度（数字，天然单调递增，
// 与现有 timeToLogical/标注体系直接兼容）。桶偶尔被快速出块跳过时补
// whitespace 占位，保证横轴严格线性。
export function aggregateByBlocks(dailyCandles, bucketSize) {
  const out = [];
  for (const c of dailyCandles) {
    if (c.open === undefined) continue;
    const b = Math.floor(heightAt(c.time + DAY) / bucketSize) * bucketSize;
    const last = out.at(-1);
    if (last && last.time === b) {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
    } else if (last && b > last.time) {
      for (let t = last.time + bucketSize; t < b; t += bucketSize) out.push({ time: t });
      out.push({ time: b, open: c.open, high: c.high, low: c.low, close: c.close });
    } else if (!last) {
      out.push({ time: b, open: c.open, high: c.high, low: c.low, close: c.close });
    }
  }
  return out;
}

// 高度轴向未来延伸（whitespace 占位到 untilHeight）
export function extendBlocks(bars, untilHeight, bucketSize) {
  const out = bars.slice();
  for (let t = bars.at(-1).time + bucketSize; t <= untilHeight; t += bucketSize) out.push({ time: t });
  return out;
}
