// 全高竖线：减半（蓝）。线画在 'normal' 层（网格之上）；
// 文本不在图内——「减半」标签收纳在图表上方的周期轴条（main.js）。
import { Primitive } from './base.js';

export class VertLine extends Primitive {
  constructor({ time, color, width = 1.5, dashed = false }) {
    super('normal');
    this._time = time;
    this._color = color;
    this._width = width;
    this._dashed = dashed;
  }

  _x(media) {
    const x = this.timeToX(this._time);
    if (x === null || x < -10 || x > media.width + 10) return null;
    return x;
  }

  _draw(ctx, media) {
    const x = this._x(media);
    if (x === null) return;
    ctx.strokeStyle = this._color;
    ctx.lineWidth = this._width;
    ctx.setLineDash(this._dashed ? [5, 4] : []);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, media.height);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
