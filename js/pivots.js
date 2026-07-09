// 枢轴计算与标注生成。
// 牛顶 = 搜索窗口内最高价那天，熊底 = 窗口内最低价那天（用户确认的画法）。
// buildAnnotations 支持两种横轴：时间（UTC 秒）与区块高度——传入 blocks 上下文
// 时所有坐标以高度为单位，预测终点按历史熊市块数规律推算。
import {
  DAY, PIVOT_WINDOWS, HALVINGS, HALVING_HEIGHTS, HALVING_INTERVAL, WAVE_BULL_HALF, BEAR_DAYS,
  EXTEND_MARGIN_DAYS, EXTEND_MARGIN_BLOCKS,
  ARROW_LABEL_MODE, FIXED_ARROW_LABELS, ARROW_BEAR_FACTOR, ARROW_BULL_FACTOR, COLORS,
} from './config.js';
import { timeAtHeight, heightAt } from './blocks.js';
import { CycleBox } from './primitives/cycle-box.js';
import { VertLine } from './primitives/vert-line.js';
import { SpanArrow } from './primitives/span-arrow.js';

export function computePivots(candles) {
  const pivots = [];
  let from = PIVOT_WINDOWS[0].from ?? candles[0].time;
  for (const w of PIVOT_WINDOWS) {
    let best = null;
    for (const c of candles) {
      if (c.time < from || c.time > w.to) continue;
      if (
        best === null ||
        (w.type === 'top' ? c.high > best.high : c.low < best.low)
      ) best = c;
    }
    if (!best) throw new Error(`枢轴窗口内没有数据：${w.type} → ${w.to}`);
    pivots.push({
      type: w.type,
      time: best.time,
      price: w.type === 'top' ? best.high : best.low,
    });
    from = best.time;
  }
  return pivots;
}

const days = (a, b) => Math.round((b - a) / DAY);
const fmtInt = (n) => Math.round(n).toLocaleString('en-US');

// 由枢轴推出全部标注 primitive 与顶部标签轴的标记。
// blocks（可选）：{ heightAt(ts), today }，传入则横轴以区块高度为单位。
// horizon（可选）：未来视界（当前轴单位），时间轴至少延伸到此，
// 未来的减半线也铺到此为止。
// 返回 { primitives, axisMarks, extendTo, meta }；meta 供顶栏周期状态使用。
export function buildAnnotations(pivots, candles, blocks = null, horizon = null) {
  const primitives = [];
  const phasePrimitives = []; // 挂在副图（狼波指数面板）上的标注
  const axisMarks = []; // 顶部标签轴条目：{ time, label, color }
  const lastReal = candles.at(-1);

  // 枢轴坐标：时间模式 = UTC 秒；区块模式 = 高度
  const pts = pivots.map((p) => ({ ...p, pos: blocks ? blocks.heightAt(p.time) : p.time }));
  const todayPos = blocks ? blocks.today : lastReal.time;

  // 周期段：相邻枢轴之间；顶→底 = 熊市，底→顶 = 牛市
  const segments = [];
  for (let i = 0; i < pts.length - 1; i++) {
    segments.push({ from: pts[i], to: pts[i + 1], type: pts[i].type === 'top' ? 'bear' : 'bull' });
  }

  // 进行中的熊市（预测）。底部未知，不假设低点价格——画成贯穿全高的区间。
  // 终点：时间模式 = 牛顶 + 364 天；区块模式 = 牛顶高度 + 历史熊市块数均值
  // （与 364 天规律同样排除不合规律的第一轮熊市）
  const lastTop = pts.at(-1);
  if (lastTop.type !== 'top') throw new Error('PIVOT_WINDOWS 应以 top 结尾（进行中周期的牛顶）');
  let predictedEnd;
  if (blocks) {
    const bearSpans = [];
    for (let i = 2; i + 1 < pts.length; i += 2) bearSpans.push(pts[i + 1].pos - pts[i].pos);
    const bearBlocks = Math.round(bearSpans.reduce((a, b) => a + b, 0) / bearSpans.length);
    predictedEnd = lastTop.pos + bearBlocks;
  } else {
    predictedEnd = lastTop.pos + BEAR_DAYS * DAY;
  }
  segments.push({
    from: lastTop,
    to: { pos: predictedEnd, price: lastTop.price },
    type: 'bear',
    projected: true,
  });

  // 时长标尺（实际市场的度量层，端点为价格枢轴）：熊市悬于上方（红），
  // 牛市悬于下方（绿）。时间模式显示天数（默认原图数字）；区块模式显示块数
  segments.forEach((seg, i) => {
    const priceLow = Math.min(seg.from.price, seg.to.price);
    const priceHigh = Math.max(seg.from.price, seg.to.price);
    const isBull = seg.type === 'bull';
    let arrowLabel;
    if (blocks) {
      arrowLabel = `${fmtInt(seg.to.pos - seg.from.pos)} 块`;
    } else {
      const fixed = FIXED_ARROW_LABELS[i];
      arrowLabel = ARROW_LABEL_MODE === 'fixed' && fixed
        ? fixed
        : `${days(seg.from.pos, seg.to.pos)} 天`;
    }
    primitives.push(new SpanArrow({
      from: seg.from.pos,
      to: seg.to.pos,
      price: isBull ? priceLow * ARROW_BULL_FACTOR : priceHigh * ARROW_BEAR_FACTOR,
      label: arrowLabel,
      color: isBull ? COLORS.arrowBull : COLORS.arrowBear,
    }));
  });

  // 「今日」分隔线：实际数据与未来推演的分界
  primitives.push(new VertLine({ time: todayPos, color: COLORS.today, dashed: true }));
  axisMarks.push({ time: todayPos, label: '今日', color: COLORS.todayLabel });

  // 预测终点已过时仍保留右侧留白（以「今日」为准）；有未来视界时延伸到视界
  const extendTo = Math.max(
    horizon ?? 0,
    Math.max(predictedEnd, todayPos)
      + (blocks ? EXTEND_MARGIN_BLOCKS : EXTEND_MARGIN_DAYS * DAY),
  );

  // 牛熊区间：由狼波周期指数（纯区块制）推导——牛市 = 减半 ± 78,750 块
  //（指数上行段），其余为熊市（下行段）；铺满全轴含未来推演，
  // 「今日」之后的部分用浅色 + 虚线边 +（预测）标注
  const startPos = blocks ? heightAt(candles[0].time) : candles[0].time;
  const toPos = (h) => (blocks ? h : timeAtHeight(h));
  const bandAnchors = [];
  for (let k = 1; k <= 12; k++) {
    bandAnchors.push({ h: k * HALVING_INTERVAL - WAVE_BULL_HALF, bull: true });
    bandAnchors.push({ h: k * HALVING_INTERVAL + WAVE_BULL_HALF, bull: false });
  }
  for (let i = 0; i + 1 < bandAnchors.length; i++) {
    const from = toPos(bandAnchors[i].h);
    const to = toPos(bandAnchors[i + 1].h);
    if (to < startPos || from > extendTo) continue;
    const isBull = bandAnchors[i].bull;
    const base = {
      borderColor: isBull ? COLORS.bullBorder : COLORS.bearBorder,
      labelColor: isBull ? COLORS.bullLabel : COLORS.bearLabel,
      labelPos: isBull ? 'top' : 'bottom',
      fullHeight: true,
    };
    const label = isBull ? '牛市' : '熊市';
    const fill = isBull ? COLORS.bandFillBull : COLORS.bandFillBear;
    const fillProjected = isBull ? COLORS.bandFillBullProjected : COLORS.bandFillBearProjected;
    if (to <= todayPos) {
      primitives.push(new CycleBox({ ...base, from, to, fill, label }));
    } else if (from >= todayPos) {
      primitives.push(new CycleBox({ ...base, from, to, fill: fillProjected, label: `${label}（预测）`, dashed: true }));
    } else {
      primitives.push(new CycleBox({ ...base, from, to: todayPos, fill, label }));
      primitives.push(new CycleBox({ ...base, from: todayPos, to, fill: fillProjected, label: `${label}（预测）`, dashed: true }));
    }
  }

  // 减半竖线：按 210,000 块网格铺到视界为止。已发生的用准确日期/高度；
  // 未来的高度精确、日期只是按当前出块速度的估算（时间视图画虚线以示区别）。
  // 主图与狼波指数副图各挂一条，视觉上贯穿两个面板
  for (let i = 0; i < 10; i++) {
    const hgt = HALVING_HEIGHTS[0] + i * HALVING_INTERVAL;
    const pos = blocks ? hgt : (HALVINGS[i] ?? timeAtHeight(hgt));
    if (pos > extendTo) break;
    const future = pos > todayPos;
    primitives.push(new VertLine({ time: pos, color: COLORS.halving, dashed: future && !blocks }));
    phasePrimitives.push(new VertLine({ time: pos, color: COLORS.halving, dashed: future && !blocks }));
    axisMarks.push({ time: pos, label: '减半日', color: COLORS.halvingLabel });
  }

  return {
    primitives,
    phasePrimitives,
    axisMarks,
    extendTo,
    meta: { topPos: lastTop.pos, todayPos, predictedEnd },
  };
}
