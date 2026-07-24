// 枢轴计算与标注生成。
// 牛顶 = 搜索窗口内最高价那天，熊底 = 窗口内最低价那天（用户确认的画法）。
// 横轴以区块高度为唯一坐标系：所有标注位置都是高度，日期仅作刻度辅助显示。
import {
  PIVOT_WINDOWS, HALVING_INTERVAL, WAVE_BULL_HALF,
  EXTEND_MARGIN_BLOCKS, COLORS,
} from './config.js';
import { heightAt, timeAtHeight } from './blocks.js';
import { t } from './i18n.js';
import { PhaseArea } from './primitives/phase-area.js';
import { VertLine } from './primitives/vert-line.js';

// DD/MM/YYYY（与 main.js 全站日期格式一致），减半标签的日期行用
const fmtDMY = (ts) => {
  const d = new Date(ts * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};

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

// 由枢轴推出全部标注 primitive，按类别分组返回（牛熊区着色与减半线
// 各有独立的显隐开关）。todayH：当前链上高度；horizon：未来视界高度。
// 返回 { bandPrims, halvingPrims, phaseBandPrims, phaseHalvingPrims, extendTo, meta }。
export function buildAnnotations(pivots, todayH, horizon = null) {
  const bandPrims = [];         // 主图：牛熊夹心填充 + 类型标签
  const halvingPrims = [];      // 主图：减半竖线 + 竖排标签
  const phaseBandPrims = [];    // 副图对应两类
  const phaseHalvingPrims = [];

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

  // 今日位置由常驻的当前区块引导线表达（DOM，见 main.js updateNowGuide），
  // 图内不再挂「今日」文本标签

  // 预测终点已过时仍保留右侧留白（以「今日」为准）；有未来视界时延伸到视界
  const extendTo = Math.max(
    horizon ?? 0,
    Math.max(predictedEnd, todayPos) + EXTEND_MARGIN_BLOCKS,
  );

  // 减半竖线：按 210,000 区块网格从首次减半（210,000）铺到视界为止
  //（高度是协议常量，全部实线）。主图与狼波指数副图各挂一条，
  // 视觉上贯穿两个面板；先于夹心填充挂载 = 画在最底层，任何内容
  // 都不被它遮挡；沿线竖排标签
  for (let i = 0; i < 10; i++) {
    const hgt = (i + 1) * HALVING_INTERVAL;
    if (hgt > extendTo) break;
    halvingPrims.push(new VertLine({
      time: hgt, color: COLORS.halving,
      // 「第 n 次减半」+ 日期（高度→日期插值，过去为真实链上时间）
      label: t('halvingTag', i + 1, fmtDMY(timeAtHeight(hgt))),
      labelColor: COLORS.halvingLabel,
    }));
    phaseHalvingPrims.push(new VertLine({ time: hgt, color: COLORS.halving }));
  }

  // 牛熊区间：由狼波周期指数（纯区块制）推导——牛市 = 减半 ± 78,750 区块
  //（指数上行段），其余为熊市（下行段）。着色为「夹心填充」：主图从价格
  // 收盘连线向下、副图从面板顶边向下到狼波指数线，两块上下拼接成
  // 上缘贴价格线、下缘贴指数线的连续区域；无价格的时段（更早历史 /
  // 未来推演）主图满高填充，价格实时右进逐步「吃掉」色块
  //（负高度不存在，区间起点钳制在 0）；牛市/熊市标签画在填充区内部
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
    const fill = isBull ? COLORS.bandFillBull : COLORS.bandFillBear;
    bandPrims.push(new PhaseArea({
      from,
      to,
      fill,
      mode: 'price',
      label: isBull ? t('bull') : t('bear'),
      labelColor: isBull ? COLORS.bullLabel : COLORS.bearLabel,
    }));
    phaseBandPrims.push(new PhaseArea({ from, to, fill, mode: 'wave' }));
  }

  return {
    bandPrims,
    halvingPrims,
    phaseBandPrims,
    phaseHalvingPrims,
    extendTo,
    meta: { topPos: lastTop.pos, todayPos, predictedEnd },
  };
}
