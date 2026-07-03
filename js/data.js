// 数据管线：内置快照 + Bitstamp 实时尾部合并，Coinbase 降级备用。
import { DAY } from './config.js';

const timeoutSignal = (ms) => {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
};

export async function loadSnapshot() {
  const res = await fetch('./data/btc-daily.json');
  if (!res.ok) throw new Error(`快照加载失败：HTTP ${res.status}`);
  const json = await res.json();
  return json.candles.map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
}

// Bitstamp：最近 1000 天（含今日未收盘 K 线），一次请求
export async function fetchBitstampLive() {
  const todayUtc = Math.floor(Date.now() / 1000 / DAY) * DAY;
  const start = todayUtc - 999 * DAY;
  const url = `https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=${DAY}&limit=1000&start=${start}`;
  const res = await fetch(url, { signal: timeoutSignal(10000) });
  if (!res.ok) throw new Error(`Bitstamp HTTP ${res.status}`);
  const json = await res.json();
  return json.data.ohlc.map((r) => ({
    time: Number(r.timestamp),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
  }));
}

// Coinbase 备用：最近 300 天（返回降序数组 [t, low, high, open, close, vol]）
export async function fetchCoinbaseFallback() {
  const end = new Date();
  const start = new Date(end.getTime() - 299 * DAY * 1000);
  const url = `https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=${DAY}&start=${start.toISOString()}&end=${end.toISOString()}`;
  const res = await fetch(url, { signal: timeoutSignal(10000) });
  if (!res.ok) throw new Error(`Coinbase HTTP ${res.status}`);
  const rows = await res.json();
  return rows
    .map(([t, low, high, open, close]) => ({ time: t, open, high, low, close }))
    .sort((a, b) => a.time - b.time);
}

// 按时间戳合并，extra 覆盖 base 的重叠部分
export function mergeCandles(base, extra) {
  const map = new Map();
  for (const c of base) map.set(c.time, c);
  for (const c of extra) map.set(c.time, c);
  return [...map.values()].sort((a, b) => a.time - b.time);
}

// 补齐内部缺口（用 whitespace 占位），保证数组严格逐日连续——
// 标注的「时间 → 逻辑坐标」查表依赖这一点
export function fillGaps(candles) {
  const out = [];
  let gaps = 0;
  for (const c of candles) {
    if (out.length) {
      for (let t = out.at(-1).time + DAY; t < c.time; t += DAY) {
        out.push({ time: t });
        gaps++;
      }
    }
    out.push(c);
  }
  if (gaps > 0) console.warn(`数据存在 ${gaps} 天缺口，已用空白占位补齐`);
  return out;
}

// 时间轴向未来延伸（whitespace 数据只有 time 字段）
export function extendWithWhitespace(candles, untilTs) {
  const out = candles.slice();
  for (let t = candles.at(-1).time + DAY; t <= untilTs; t += DAY) out.push({ time: t });
  return out;
}
