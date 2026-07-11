// 枢轴计算与标注生成。
// 牛顶 = 搜索窗口内最高价那天，熊底 = 窗口内最低价那天（用户确认的画法）。
// 横轴以区块高度为唯一坐标系：所有标注位置都是高度，日期仅作刻度辅助显示。
import {
  PIVOT_WINDOWS, HALVING_INTERVAL, WAVE_BULL_HALF,
  EXTEND_MARGIN_BLOCKS, COLORS,
} from './config.js';
import { heightAt } from './blocks.js';
import { t } from './i18n.js';
import { CycleBox } from './primitives/cycle-box.js';
import { VertLine } from './primitives/vert-line.js';

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

// 由枢轴推出全部标注 primitive。
// todayH：当前链上高度；horizon：未来视界高度（横轴至少延伸到此）。
// 返回 { primitives, phasePrimitives, extendTo, meta }。
export function buildAnnotations(pivots, todayH, horizon = null) {
  const primitives = [];
  const phasePrimitives = []; // 挂在副图（狼波指数面板）上的标注

  // 枢轴坐标：区块高度
  const pts = pivots.map((p) => ({ ...p, pos: heightAt(p.time) }));
  const todayPos = todayH;

  // 进行中熊市的预测终点 = 牛顶高度 + 历史熊市块数均值
  //（排除不合规律的第一轮熊市；供顶栏周期状态与右侧留白使用）
  const lastTop = pts.at(-1);
  if (lastTop.type !== 'top') throw new Error('PIVOT_WINDOWS 应以 top 结尾（进行中周期的牛顶）');
  const bearSpans = [];
  for (let i = 2; i + 1 < pts.length; i += 2) bearSpans.push(pts[i + 1].pos - pts[i].pos);
  const bearBlocks = Math.round(bearSpans.reduce((a, b) => a + b, 0) / bearSpans.length);
  const predictedEnd = lastTop.pos + bearBlocks;

  // 「今日」分隔线：实际数据与未来推演的分界（标签钉在线顶）
  primitives.push(new VertLine({
    time: todayPos, color: COLORS.today, dashed: true,
    label: t('today'), labelColor: COLORS.todayLabel,
  }));

  // 预测终点已过时仍保留右侧留白（以「今日」为准）；有未来视界时延伸到视界
  const extendTo = Math.max(
    horizon ?? 0,
    Math.max(predictedEnd, todayPos) + EXTEND_MARGIN_BLOCKS,
  );

  // 牛熊区间：由狼波周期指数（纯区块制）推导——牛市 = 减半 ± 78,750 区块
  //（指数上行段），其余为熊市（下行段）；从区块 0 铺满全轴含未来推演
  //（负高度不存在，区间起点钳制在 0），「今日」之后浅色 + 虚线边 +（预测）
  const bandAnchors = [];
  for (let k = 0; k <= 12; k++) {
    bandAnchors.push({ h: k * HALVING_INTERVAL - WAVE_BULL_HALF, bull: true });
    bandAnchors.push({ h: k * HALVING_INTERVAL + WAVE_BULL_HALF, bull: false });
  }
  for (let i = 0; i + 1 < bandAnchors.length; i++) {
    const from = Math.max(bandAnchors[i].h, 0);
    const to = bandAnchors[i + 1].h;
    if (to <= 0 || from > extendTo) continue;
    const isBull = bandAnchors[i].bull;
    const base = {
      borderColor: isBull ? COLORS.bullBorder : COLORS.bearBorder,
      labelColor: isBull ? COLORS.bullLabel : COLORS.bearLabel,
      labelPos: isBull ? 'top' : 'bottom',
      fullHeight: true,
    };
    const label = isBull ? t('bull') : t('bear');
    const fill = isBull ? COLORS.bandFillBull : COLORS.bandFillBear;
    const fillProjected = isBull ? COLORS.bandFillBullProjected : COLORS.bandFillBearProjected;
    // 主图带标签；副图（狼波指数面板）画同位置的无标签副本，视觉贯穿两个面板
    const addBand = (bFrom, bTo, bFill, bLabel, dashed = false) => {
      primitives.push(new CycleBox({ ...base, from: bFrom, to: bTo, fill: bFill, label: bLabel, dashed }));
      phasePrimitives.push(new CycleBox({ ...base, from: bFrom, to: bTo, fill: bFill, dashed }));
    };
    if (to <= todayPos) {
      addBand(from, to, fill, label);
    } else if (from >= todayPos) {
      addBand(from, to, fillProjected, t('proj', label), true);
    } else {
      addBand(from, todayPos, fill, label);
      addBand(todayPos, to, fillProjected, t('proj', label), true);
    }
  }

  // 减半竖线：按 210,000 区块网格从首次减半（210,000）铺到视界为止
  //（高度是协议常量，全部实线）。主图与狼波指数副图各挂一条，
  // 视觉上贯穿两个面板；标签钉在主图线顶
  for (let i = 0; i < 10; i++) {
    const hgt = (i + 1) * HALVING_INTERVAL;
    if (hgt > extendTo) break;
    primitives.push(new VertLine({
      time: hgt, color: COLORS.halving,
      label: t('halving'), labelColor: COLORS.halvingLabel,
    }));
    phasePrimitives.push(new VertLine({ time: hgt, color: COLORS.halving }));
  }

  return {
    primitives,
    phasePrimitives,
    extendTo,
    meta: { topPos: lastTop.pos, todayPos, predictedEnd },
  };
}
