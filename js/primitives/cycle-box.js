// 牛市/熊市半透明区间 + 角标签。projected（预测）段用虚线边框 + 减半填充。
import { Primitive, clamp } from './base.js';
import { FONT } from '../config.js';

export class CycleBox extends Primitive {
  // labelPos: 'top' 标签画在框内左上角，'bottom' 画在框内左下角
  constructor({ from, to, priceLow, priceHigh, fill, borderColor, label, labelColor, labelPos = 'top', dashed = false }) {
    super('bottom');
    this._from = from;
    this._to = to;
    this._priceLow = priceLow;
    this._priceHigh = priceHigh;
    this._fill = fill;
    this._borderColor = borderColor;
    this._label = label;
    this._labelColor = labelColor;
    this._labelPos = labelPos;
    this._dashed = dashed;
  }

  _range() {
    return { fromTime: this._from, toTime: this._to, minPrice: this._priceLow, maxPrice: this._priceHigh };
  }

  _draw(ctx, media) {
    const x1 = this.timeToX(this._from);
    const x2 = this.timeToX(this._to);
    const y1 = this.priceToY(this._priceHigh);
    const y2 = this.priceToY(this._priceLow);
    if (x1 === null || x2 === null || y1 === null || y2 === null) return;
    if (x2 < 0 || x1 > media.width) return;
    if (y2 < 0 || y1 > media.height) return; // 整个框在视口上方/下方时不画（含标签）

    const cx1 = clamp(x1, media.width);
    const cx2 = clamp(x2, media.width);
    const cy1 = clamp(y1, media.height);
    const cy2 = clamp(y2, media.height);

    ctx.fillStyle = this._fill;
    ctx.fillRect(cx1, cy1, cx2 - cx1, cy2 - cy1);

    ctx.strokeStyle = this._borderColor;
    ctx.lineWidth = 1;
    ctx.setLineDash(this._dashed ? [5, 4] : []);
    ctx.strokeRect(cx1, cy1, cx2 - cx1, cy2 - cy1);
    ctx.setLineDash([]);

    if (!this._label) return;
    // 框缘滚出屏幕时标签贴住视口边缘，保持可见（上缘避开顶部读数区）
    const lx = Math.max(cx1, 0) + 8;
    if (cx2 - lx < 48) return; // 框太窄/基本滚出视口时不画标签
    ctx.font = `600 13px ${FONT}`;
    ctx.fillStyle = this._labelColor;
    ctx.textAlign = 'left';
    if (this._labelPos === 'top') {
      ctx.textBaseline = 'top';
      ctx.fillText(this._label, lx, cy1 < 0 ? 30 : cy1 + 8);
    } else {
      ctx.textBaseline = 'bottom';
      ctx.fillText(this._label, lx, Math.min(cy2, media.height) - 8);
    }
  }
}
