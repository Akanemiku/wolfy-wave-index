// 牛顶气泡标注：锚定在数据点上，指引线 + 圆角白底文字框。
import { Primitive, roundedRectPath } from './base.js';
import { COLORS, FONT } from '../config.js';

export class Callout extends Primitive {
  constructor({ time, price, lines }) {
    super('top');
    this._time = time;
    this._price = price;
    this._lines = lines;
  }

  _range() {
    return { fromTime: this._time, toTime: this._time, minPrice: this._price, maxPrice: this._price * 1.05 };
  }

  _draw(ctx, media) {
    const x = this.timeToX(this._time);
    const y = this.priceToY(this._price);
    if (x === null || y === null) return;
    if (x < -50 || x > media.width + 50) return;
    if (y < -50 || y > media.height + 50) return;

    ctx.font = `600 12px ${FONT}`;
    const lineH = 18;
    const pad = 9;
    const w = Math.max(...this._lines.map((l) => ctx.measureText(l).width)) + pad * 2;
    const h = this._lines.length * lineH + pad * 2 - 6;

    // 默认放在锚点右下方；越界则翻转到左侧/上方
    let bx = x + 24;
    let by = y + 56;
    if (bx + w > media.width - 8) bx = x - 24 - w;
    if (by + h > media.height - 8) by = y - 56 - h;
    bx = Math.max(8, bx);
    by = Math.max(8, by);

    // 指引线：锚点 → 文字框最近的角
    const tx = bx + (x > bx + w / 2 ? w : 0);
    ctx.strokeStyle = COLORS.calloutBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tx, by + (y > by + h / 2 ? h : 0));
    ctx.stroke();

    ctx.fillStyle = COLORS.calloutBg;
    ctx.beginPath();
    roundedRectPath(ctx, bx, by, w, h, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = COLORS.calloutText;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    this._lines.forEach((l, i) => ctx.fillText(l, bx + pad, by + pad - 3 + i * lineH));
  }
}
