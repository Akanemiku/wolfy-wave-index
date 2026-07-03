// 枢轴计算与标注生成。
// 牛顶 = 搜索窗口内最高价那天，熊底 = 窗口内最低价那天（用户确认的画法）。
import {
  DAY, PIVOT_WINDOWS, HALVINGS, BEAR_DAYS, EXTEND_MARGIN_DAYS,
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

// 由枢轴推出全部标注 primitive。返回 { primitives, extendTo }。
export function buildAnnotations(pivots, candles) {
  const primitives = [];
  const lastReal = candles.at(-1);

  // 周期段：相邻枢轴之间；顶→底 = 熊市，底→顶 = 牛市
  const segments = [];
  for (let i = 0; i < pivots.length - 1; i++) {
    segments.push({ from: pivots[i], to: pivots[i + 1], type: pivots[i].type === 'top' ? 'bear' : 'bull' });
  }

  // 进行中的熊市（预测）：见底日 = 最后一个牛顶 + 364 天；框底 = 牛顶以来的最低价（随数据滚动加深）
  const lastTop = pivots.at(-1);
  if (lastTop.type !== 'top') throw new Error('PIVOT_WINDOWS 应以 top 结尾（进行中周期的牛顶）');
  const predictedEnd = lastTop.time + BEAR_DAYS * DAY;
  let runningLow = lastTop.price;
  for (const c of candles) {
    if (c.time >= lastTop.time && c.low < runningLow) runningLow = c.low;
  }
  segments.push({
    from: lastTop,
    to: { time: predictedEnd, price: runningLow },
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
      const splitAt = Math.min(Math.max(lastReal.time, seg.from.time), seg.to.time);
      if (splitAt > seg.from.time) {
        primitives.push(new CycleBox({
          from: seg.from.time, to: splitAt, priceLow, priceHigh, fill, borderColor, label, labelColor, labelPos,
        }));
      }
      if (seg.to.time > splitAt) {
        primitives.push(new CycleBox({
          from: splitAt, to: seg.to.time, priceLow, priceHigh,
          fill: fill.replace(/[\d.]+\)$/, (a) => `${parseFloat(a) / 2})`),
          borderColor, label: '熊市（预测）', labelColor, labelPos: 'top', dashed: true,
        }));
      }
      primitives.push(new VertLine({
        time: lastReal.time, color: COLORS.today, width: 1.5, dashed: true,
        label: '今日', badgeBg: COLORS.todayBadgeBg, badgeText: COLORS.todayBadgeText, labelY: 0.08,
      }));
    } else {
      primitives.push(new CycleBox({
        from: seg.from.time, to: seg.to.time, priceLow, priceHigh, fill, borderColor, label, labelColor, labelPos,
      }));
    }

    // 时长箭头：熊市悬于框上方（红），牛市悬于框下方（绿）
    const fixed = FIXED_ARROW_LABELS[i];
    const arrowLabel = ARROW_LABEL_MODE === 'fixed' && fixed
      ? fixed
      : `${days(seg.from.time, seg.to.time)} 天`;
    primitives.push(new SpanArrow({
      from: seg.from.time,
      to: seg.to.time,
      price: isBull ? priceLow * ARROW_BULL_FACTOR : priceHigh * ARROW_BEAR_FACTOR,
      label: arrowLabel,
      color: isBull ? COLORS.arrowBull : COLORS.arrowBear,
    }));
  });

  // 减半日竖线
  for (const h of HALVINGS) {
    primitives.push(new VertLine({
      time: h.date, color: COLORS.halving, label: '减半日',
      badgeBg: COLORS.halvingBadgeBg, badgeText: COLORS.halvingBadgeText,
      labelY: h.labelY,
    }));
  }

  // 预测见底日已过时仍保留右侧留白（以最新 K 线为准）
  return { primitives, extendTo: Math.max(predictedEnd, lastReal.time) + EXTEND_MARGIN_DAYS * DAY };
}
