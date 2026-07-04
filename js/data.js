// 数据管线：内置快照 + Bitstamp 实时尾部合并，Coinbase 降级备用。
import { DAY } from './config.js';

const timeoutSignal = (ms) => {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
};

export async function loadSnapshot() {
  const res = await fetch('./data/btc-daily.json', { signal: timeoutSignal(15000) });
  if (!res.ok) throw new Error(`快照加载失败：HTTP ${res.status}`);
  const json = await res.json();
  return json.candles.map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
}

// Bitstamp：从 sinceTs（快照末尾）拉到今天，分页补齐（快照很旧也能接上）
export async function fetchBitstampLive(sinceTs) {
  const out = [];
  let start = sinceTs;
  for (let page = 0; page < 12; page++) {
    const url = `https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=${DAY}&limit=1000&start=${start}`;
    const res = await fetch(url, { signal: timeoutSignal(10000) });
    if (!res.ok) throw new Error(`Bitstamp HTTP ${res.status}`);
    const json = await res.json();
    const rows = json.data.ohlc.map((r) => ({
      time: Number(r.timestamp),
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
    }));
    out.push(...rows);
    if (rows.length < 1000) break;
    start = out.at(-1).time + DAY;
  }
  return out;
}

// Coinbase 备用：从 sinceTs 分窗口拉到现在
// （每次请求最多 300 根，返回降序数组 [t, low, high, open, close, vol]）
export async function fetchCoinbaseFallback(sinceTs) {
  const out = [];
  const nowSec = Math.floor(Date.now() / 1000);
  let startSec = sinceTs;
  for (let page = 0; page < 20 && startSec <= nowSec; page++) {
    const endSec = Math.min(startSec + 299 * DAY, nowSec);
    const url = `https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=${DAY}`
      + `&start=${new Date(startSec * 1000).toISOString()}&end=${new Date(endSec * 1000).toISOString()}`;
    const res = await fetch(url, { signal: timeoutSignal(10000) });
    if (!res.ok) throw new Error(`Coinbase HTTP ${res.status}`);
    const rows = await res.json();
    out.push(...rows.map(([t, low, high, open, close]) => ({ time: t, open, high, low, close })));
    startSec = endSec + DAY;
  }
  return out.sort((a, b) => a.time - b.time);
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

// 日线聚合为周线（周一为界，UTC）/ 月线（自然月）
export function aggregate(candles, tf) {
  if (tf === 'day') return candles;
  const bucketStart = (t) => {
    const d = new Date(t * 1000);
    if (tf === 'week') return t - ((d.getUTCDay() + 6) % 7) * DAY;
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
  };
  const out = [];
  for (const c of candles) {
    if (c.open === undefined) continue; // 跳过缺口占位
    const b = bucketStart(c.time);
    const last = out.at(-1);
    if (last && last.time === b) {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
    } else {
      out.push({ time: b, open: c.open, high: c.high, low: c.low, close: c.close });
    }
  }
  return out;
}

// 时间轴向未来延伸（whitespace 数据只有 time 字段），步长随周期
export function extendBars(bars, untilTs, tf) {
  const next = (t) => {
    if (tf === 'week') return t + 7 * DAY;
    if (tf === 'month') {
      const d = new Date(t * 1000);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000;
    }
    return t + DAY;
  };
  const out = bars.slice();
  for (let t = next(bars.at(-1).time); t <= untilTs; t = next(t)) out.push({ time: t });
  return out;
}
