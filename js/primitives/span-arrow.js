// 水平箭头（右端箭头头部）+ 居中天数文字，如「1064 天」「364 天」。
import { Primitive, clamp } from './base.js';
import { FONT } from '../config.js';

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
    // 文字画在箭头上方，向上留 ~8% 的价格余量，保证自动缩放后文字不贴边
    return { fromTime: this._from, toTime: this._to, minPrice: this._price, maxPrice: this._price * 1.08 };
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
    ctx.fillStyle = this._color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx1, y);
    ctx.lineTo(cx2 - 2, y);
    ctx.stroke();

    // 右端箭头头部（仅在真实端点未被钳制时绘制）
    if (x2 === cx2) {
      ctx.beginPath();
      ctx.moveTo(cx2, y);
      ctx.lineTo(cx2 - 9, y - 4.5);
      ctx.lineTo(cx2 - 9, y + 4.5);
      ctx.closePath();
      ctx.fill();
    }

    if (!this._label) return;
    // 只在箭头可见跨度足够时画文字，且文字锚定在可见跨度的中点，避免与箭头脱节
    const vx1 = Math.max(cx1, 0);
    const vx2 = Math.min(cx2, media.width);
    if (vx2 - vx1 < 48) return;
    const mid = Math.max(Math.min((vx1 + vx2) / 2, media.width - 40), 40);
    ctx.font = `600 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(this._label, mid, y - 5);
  }
}
