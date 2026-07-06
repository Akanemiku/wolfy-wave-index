// 枢轴计算与标注生成。
// 牛顶 = 搜索窗口内最高价那天，熊底 = 窗口内最低价那天（用户确认的画法）。
// buildAnnotations 支持两种横轴：时间（UTC 秒）与区块高度——传入 blocks 上下文
// 时所有坐标以高度为单位，预测终点按历史熊市块数规律推算。
import {
  DAY, PIVOT_WINDOWS, HALVINGS, HALVING_HEIGHTS, BEAR_DAYS,
  EXTEND_MARGIN_DAYS, EXTEND_MARGIN_BLOCKS,
  ARROW_LABEL_MODE, FIXED_ARROW_LABELS, ARROW_BEAR_FACTOR, ARROW_BULL_FACTOR, COLORS,
} from './config.js';
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
// 返回 { primitives, axisMarks, extendTo, meta }；meta 供顶栏周期状态使用。
export function buildAnnotations(pivots, candles, blocks = null) {
  const primitives = [];
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

  segments.forEach((seg, i) => {
    const priceLow = Math.min(seg.from.price, seg.to.price);
    const priceHigh = Math.max(seg.from.price, seg.to.price);
    const isBull = seg.type === 'bull';
    const fill = isBull ? COLORS.bullFill : COLORS.bearFill;
    const borderColor = isBull ? COLORS.bullBorder : COLORS.bearBorder;
    const labelColor = isBull ? COLORS.bullLabel : COLORS.bearLabel;
    const label = isBull ? '牛市' : '熊市';
    const labelPos = isBull ? 'top' : 'bottom';

    if (seg.projected) {
      // 在「今日」处拆成 实线段 + 虚线预测段。边界情况自然退化为只画一段：
      // 今日即牛顶（当日创周期新高）→ 全部为预测段；预测期已走完 → 全部为实线段
      const splitAt = Math.min(Math.max(todayPos, seg.from.pos), seg.to.pos);
      if (splitAt > seg.from.pos) {
        primitives.push(new CycleBox({
          from: seg.from.pos, to: splitAt, fill: COLORS.bandFill,
          borderColor, label, labelColor, labelPos,
          fullHeight: true,
        }));
      }
      if (seg.to.pos > splitAt) {
        primitives.push(new CycleBox({
          from: splitAt, to: seg.to.pos, fill: COLORS.bandFillProjected,
          borderColor, label: '熊市（预测）', labelColor, labelPos: 'top', dashed: true,
          fullHeight: true,
        }));
      }
      primitives.push(new VertLine({ time: todayPos, color: COLORS.today, dashed: true }));
      axisMarks.push({ time: todayPos, label: '今日', color: COLORS.todayLabel });
    } else {
      primitives.push(new CycleBox({
        from: seg.from.pos, to: seg.to.pos, priceLow, priceHigh, fill, borderColor, label, labelColor, labelPos,
      }));
    }

    // 时长标尺：熊市悬于区间上方（红），牛市悬于区间下方（绿）。
    // 时间模式显示天数（默认原图数字）；区块模式显示块数
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

  // 狼波周期指数（Wolfy Wave Index）锚点：0 = 熊底，1 = 牛顶。历史锚点用
  // 实际顶底（峰谷与真实高低点严格对齐），未来段到预测见底为止；
  // 图左侧起点按平均牛市跨度从首个牛顶向前外推，覆盖整个可见范围。
  // 折线本身由 main.js 采样成独立副图区的线序列
  const bullSpans = [];
  for (let i = 1; i + 1 < pts.length; i += 2) bullSpans.push(pts[i + 1].pos - pts[i].pos);
  const meanBull = bullSpans.reduce((a, b) => a + b, 0) / bullSpans.length;
  const phasePts = [{ pos: pts[0].pos - meanBull, value: 0 }];
  for (const p of pts) phasePts.push({ pos: p.pos, value: p.type === 'top' ? 1 : 0 });
  phasePts.push({ pos: predictedEnd, value: 0 });

  // 减半竖线：时间模式用准确日期，区块模式用准确高度常量
  const halvingPts = blocks ? HALVING_HEIGHTS : HALVINGS;
  for (const t of halvingPts) {
    primitives.push(new VertLine({ time: t, color: COLORS.halving }));
    axisMarks.push({ time: t, label: '减半日', color: COLORS.halvingLabel });
  }

  // 预测终点已过时仍保留右侧留白（以「今日」为准）
  const extendTo = Math.max(predictedEnd, todayPos)
    + (blocks ? EXTEND_MARGIN_BLOCKS : EXTEND_MARGIN_DAYS * DAY);

  return {
    primitives,
    axisMarks,
    extendTo,
    phasePts,
    meta: { topPos: lastTop.pos, todayPos, predictedEnd },
  };
}

// 狼波周期指数在任意坐标处的取值（锚点间线性插值，0~1）
export function phaseAt(points, pos) {
  if (pos <= points[0].pos) return points[0].value;
  for (let i = 0; i + 1 < points.length; i++) {
    if (pos <= points[i + 1].pos) {
      const f = (pos - points[i].pos) / (points[i + 1].pos - points[i].pos);
      return points[i].value + f * (points[i + 1].value - points[i].value);
    }
  }
  return points.at(-1).value;
}
