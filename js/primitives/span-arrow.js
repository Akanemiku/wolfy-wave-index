// 时长标尺：带端点刻度的水平测量线 |———「1064 天」———|，
// 天数标签胶囊居中覆盖在线上（TradingView 测量工具风格）。
import { Primitive, clamp, drawTag } from './base.js';
import { COLORS } from '../config.js';

const TICK = 5; // 端点刻度半高（px）

export class SpanArrow extends Primitive {
  constructor({ from, to, price, label, color }) {
    super('top');
    this._from = from;
    this._to = to;
    this._price = price;
    this._label = label;
    this._color = color;
  }

  _range() {
    // 标签胶囊以线为中心，上下各留 ~8% 的价格余量，保证自动缩放后不贴边
    return { fromTime: this._from, toTime: this._to, minPrice: this._price * 0.94, maxPrice: this._price * 1.08 };
  }

  _draw(ctx, media) {
    const x1 = this.timeToX(this._from);
    const x2 = this.timeToX(this._to);
    const y = this.priceToY(this._price);
    if (x1 === null || x2 === null || y === null) return;
    if (x2 < 0 || x1 > media.width || y < -20 || y > media.height + 20) return;

    const cx1 = clamp(x1, media.width);
    const cx2 = clamp(x2, media.width);

    ctx.strokeStyle = this._color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx1, y);
    ctx.lineTo(cx2, y);
    // 端点竖刻度（仅在真实端点未被钳制、即端点可见时绘制）
    if (x1 === cx1) {
      ctx.moveTo(cx1 + 0.5, y - TICK);
      ctx.lineTo(cx1 + 0.5, y + TICK);
    }
    if (x2 === cx2) {
      ctx.moveTo(cx2 - 0.5, y - TICK);
      ctx.lineTo(cx2 - 0.5, y + TICK);
    }
    ctx.stroke();

    if (!this._label) return;
    // 标签锚定在可见跨度的中点；跨度太窄时不画，避免与标尺脱节
    const vx1 = Math.max(cx1, 0);
    const vx2 = Math.min(cx2, media.width);
    if (vx2 - vx1 < 60) return;
    const mid = Math.max(Math.min((vx1 + vx2) / 2, media.width - 40), 40);
    drawTag(ctx, mid, y, this._label, { bg: COLORS.tagBg, color: this._color, anchor: 'center' });
  }
}
