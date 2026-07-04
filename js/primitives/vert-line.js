// 全高竖线：减半日（蓝）、今日分隔（灰虚线）。
// 画在 'normal' 层（网格之上、时长标尺之下）——画在 'bottom' 层时
// 横向网格线会盖在竖线上，造成一节节的断纹。文字标签不在这里画，
// 统一显示在图表顶部的标签轴里（main.js 的 top-axis）。
import { Primitive } from './base.js';

export class VertLine extends Primitive {
  constructor({ time, color, width = 1.5, dashed = false }) {
    super('normal');
    this._time = time;
    this._color = color;
    this._width = width;
    this._dashed = dashed;
  }

  _draw(ctx, media) {
    const x = this.timeToX(this._time);
    if (x === null || x < -10 || x > media.width + 10) return;
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
