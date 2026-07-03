// 一次性快照脚本：从 Bitstamp 拉取 2013-01-01 至今的 BTC/USD 日线，
// 校验逐日连续后写入 data/btc-daily.json。用法：node scripts/fetch-history.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DAY = 86400;
const START = Date.UTC(2013, 0, 1) / 1000;
const API = 'https://www.bitstamp.net/api/v2/ohlc/btcusd/';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(start) {
  const url = `${API}?step=${DAY}&limit=1000&start=${start}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Bitstamp HTTP ${res.status} for ${url}`);
  const json = await res.json();
  return json.data.ohlc;
}

const candles = [];
let start = START;
for (;;) {
  const rows = await fetchPage(start);
  if (rows.length === 0) break;
  for (const r of rows) {
    candles.push([
      Number(r.timestamp),
      Number(Number(r.open).toFixed(2)),
      Number(Number(r.high).toFixed(2)),
      Number(Number(r.low).toFixed(2)),
      Number(Number(r.close).toFixed(2)),
    ]);
  }
  console.log(`fetched ${rows.length} rows, up to ${new Date(candles.at(-1)[0] * 1000).toISOString().slice(0, 10)}`);
  if (rows.length < 1000) break;
  start = candles.at(-1)[0] + DAY;
  await sleep(300);
}

// 丢弃当日未收盘的 K 线，保证快照里都是已收盘数据
const todayUtc = Math.floor(Date.now() / 1000 / DAY) * DAY;
while (candles.length && candles.at(-1)[0] >= todayUtc) candles.pop();

// 校验：严格升序、逐日无缺口
for (let i = 1; i < candles.length; i++) {
  const [prev, cur] = [candles[i - 1][0], candles[i][0]];
  if (cur !== prev + DAY) {
    console.error(`数据缺口：${new Date(prev * 1000).toISOString().slice(0, 10)} -> ${new Date(cur * 1000).toISOString().slice(0, 10)}`);
    process.exit(1);
  }
}

const out = {
  generated: new Date().toISOString(),
  source: 'bitstamp',
  pair: 'BTC/USD',
  candles,
};
const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'btc-daily.json');
writeFileSync(path, JSON.stringify(out));
console.log(`OK: ${candles.length} 根日线（${new Date(candles[0][0] * 1000).toISOString().slice(0, 10)} → ${new Date(candles.at(-1)[0] * 1000).toISOString().slice(0, 10)}）已写入 ${path}`);
