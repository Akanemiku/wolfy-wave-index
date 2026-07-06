// 一次性快照脚本：从 mempool.space 拉取全史难度调整锚点（每 2016 块一个），
// 用于「日期 ↔ 区块高度」插值映射。用法：node scripts/fetch-heights.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const res = await fetch('https://mempool.space/api/v1/mining/difficulty-adjustments');
if (!res.ok) throw new Error(`mempool.space HTTP ${res.status}`);
const rows = await res.json();

// 返回格式 [timestamp, height, difficulty, change]，倒序 → 取 (ts, height) 升序
const anchors = rows
  .map((r) => [r[0], r[1]])
  .sort((a, b) => a[0] - b[0]);

// 校验：时间与高度都严格递增
for (let i = 1; i < anchors.length; i++) {
  if (anchors[i][0] <= anchors[i - 1][0] || anchors[i][1] <= anchors[i - 1][1]) {
    console.error(`锚点非递增：#${i}`, anchors[i - 1], anchors[i]);
    process.exit(1);
  }
}

const out = { generated: new Date().toISOString(), source: 'mempool.space', anchors };
const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'btc-heights.json');
writeFileSync(path, JSON.stringify(out));
console.log(`OK: ${anchors.length} 个锚点（高度 ${anchors[0][1]} → ${anchors.at(-1)[1]}）已写入 ${path}`);
