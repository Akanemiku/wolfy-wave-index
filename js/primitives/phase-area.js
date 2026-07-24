// 牛熊「夹心」填充：只画上缘贴价格线、下缘贴狼波指数线之间的区域，
// 且仅在有真实价格数据的范围内（首根 → 末根真实 K 线）。
// mode 'price'（主图）：从价格收盘连线向下填充到面板底边，线上方不画；
// mode 'wave'（副图）：从面板顶边向下填充到狼波指数线，线下方不画。
// 两个面板上下紧贴，两块填充拼接成视觉上连续的夹心区域；
// 副图隐藏时其填充随标注一并卸载，主图仍填充到底边（自然退化）。
import { Primitive, seriesData, timeToLogical } from './base.js';
import { waveIndexAt } from '../blocks.js';

// 真实价格覆盖的下标范围 [首根, 末根真实 bar]，按数据数组身份缓存
let _cacheFor = null;
let _cacheRange = null;
function realRange(data) {
  if (data === _cacheFor) return _cacheRange;
  _cacheFor = data;
  _cacheRange = null;
  const first = data.findIndex((b) => b.open !== undefined);
  if (first >= 0) {
    let last = data.length - 1;
    while (data[last].open === undefined) last--;
    _cacheRange = { first, last };
  }
  return _cacheRange;
}

export class PhaseArea extends Primitive {
  constructor({ from, to, fill, mode }) {
    super('bottom');
    this._from = from;
    this._to = to;
    this._fill = fill;
    this._mode = mode; // 'price' | 'wave'
  }

  _draw(ctx, media) {
    const data = seriesData();
    const rr = data.length ? realRange(data) : null;
    if (!rr) return;
    // 区间裁到真实价格覆盖范围，区间外（未来推演/无价格的早期）不画
    const from = Math.max(this._from, data[rr.first].time);
    const to = Math.min(this._to, data[rr.last].time);
    if (to <= from) return;
    const x1 = this.timeToX(from);
    const x2 = this.timeToX(to);
    if (x1 === null || x2 === null || x2 < 0 || x1 > media.width) return;
    ctx.save();
    ctx.beginPath();
    // 区间边界不与 K 线桶对齐（78,750 不是桶宽的整数倍）：多边形按整根
    // K 线取点、向两侧各多取一根，再用矩形裁剪在精确边界处切齐
    const cl = Math.max(x1, 0);
    ctx.rect(cl, 0, Math.min(x2, media.width) - cl, media.height);
    ctx.clip();
    ctx.beginPath();
    if (this._mode === 'wave') {
      // 指数在单个牛/熊区间内严格线性，下缘只需两个端点
      const y1 = this.priceToY(waveIndexAt(from));
      const y2 = this.priceToY(waveIndexAt(to));
      if (y1 === null || y2 === null) { ctx.restore(); return; }
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x2, 0);
      ctx.lineTo(x1, 0);
    } else {
      // 沿真实收盘连线取上缘（bars 的下标即逻辑坐标，直接查像素）；
      // 深度放大时按可见范围截断，不为屏外区段落笔
      const ts = this._chart.timeScale();
      const vr = ts.getVisibleLogicalRange();
      if (!vr) { ctx.restore(); return; }
      const iA = Math.max(rr.first, Math.floor(Math.max(timeToLogical(from), vr.from)) - 1);
      const iB = Math.min(rr.last, Math.ceil(Math.min(timeToLogical(to), vr.to)) + 1);
      let firstX = null;
      let lastX = null;
      for (let i = iA; i <= iB; i++) {
        const b = data[i];
        if (b.open === undefined) continue; // 桶内无成交的占位桶：连线跨过
        const x = ts.logicalToCoordinate(i);
        const y = this.priceToY(b.close);
        if (x === null || y === null) continue;
        if (firstX === null) { ctx.moveTo(x, y); firstX = x; } else ctx.lineTo(x, y);
        lastX = x;
      }
      if (firstX === null) { ctx.restore(); return; }
      ctx.lineTo(lastX, media.height);
      ctx.lineTo(firstX, media.height);
    }
    ctx.closePath();
    ctx.fillStyle = this._fill;
    ctx.fill();
    ctx.restore();
  }
}
