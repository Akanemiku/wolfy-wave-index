// 牛市/熊市半透明区间：底色画在 K 线下层。
// 文本不在图内——牛市/熊市标签收纳在图表上方的周期轴条（main.js）。
import { Primitive, clamp } from './base.js';

export class CycleBox extends Primitive {
  // fullHeight: 进行中的周期底部未知，只画时间区间——贯穿全高的竖向色带，
  //             仅画左右边界线，不参与价格自动缩放
  constructor({ from, to, priceLow, priceHigh, fill, borderColor, fullHeight = false }) {
    super('bottom');
    this._from = from;
    this._to = to;
    this._priceLow = priceLow;
    this._priceHigh = priceHigh;
    this._fill = fill;
    this._borderColor = borderColor;
    this._fullHeight = fullHeight;
  }

  _range() {
    if (this._fullHeight) return null;
    return { fromTime: this._from, toTime: this._to, minPrice: this._priceLow, maxPrice: this._priceHigh };
  }

  // 返回钳制后的屏幕坐标；不可见时返回 null
  _rect(media) {
    const x1 = this.timeToX(this._from);
    const x2 = this.timeToX(this._to);
    if (x1 === null || x2 === null) return null;
    if (x2 < 0 || x1 > media.width) return null;
    if (this._fullHeight) {
      return { cx1: clamp(x1, media.width), cx2: clamp(x2, media.width), cy1: 0, cy2: media.height, x1, x2 };
    }
    const y1 = this.priceToY(this._priceHigh);
    const y2 = this.priceToY(this._priceLow);
    if (y1 === null || y2 === null) return null;
    if (y2 < 0 || y1 > media.height) return null;
    return {
      cx1: clamp(x1, media.width),
      cx2: clamp(x2, media.width),
      cy1: clamp(y1, media.height),
      cy2: clamp(y2, media.height),
      x1,
      x2,
    };
  }

  _draw(ctx, media) {
    const r = this._rect(media);
    if (!r) return;
    ctx.fillStyle = this._fill;
    ctx.fillRect(r.cx1, r.cy1, r.cx2 - r.cx1, r.cy2 - r.cy1);
    ctx.strokeStyle = this._borderColor;
    ctx.lineWidth = 1;
    if (this._fullHeight) {
      // 只画左右边界线（且仅当真实边缘在视口内时）
      ctx.beginPath();
      if (r.x1 === r.cx1) {
        ctx.moveTo(r.cx1 + 0.5, 0);
        ctx.lineTo(r.cx1 + 0.5, media.height);
      }
      if (r.x2 === r.cx2) {
        ctx.moveTo(r.cx2 - 0.5, 0);
        ctx.lineTo(r.cx2 - 0.5, media.height);
      }
      ctx.stroke();
    } else {
      ctx.strokeRect(r.cx1, r.cy1, r.cx2 - r.cx1, r.cy2 - r.cy1);
    }
  }
}
