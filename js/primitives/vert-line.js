// 全高竖线 + 置顶标签：减半日（蓝实线）、今日分隔（灰虚线）。
// 线画在 K 线下层（'bottom'），标签画在上层（'top'）——否则常见缩放级别下
// 标签会被 K 线盖住。标签统一置顶在竖线最上方的专用空带里
// （OHLC 读数行之下，K 线区域之上，见 chart.js 的 scaleMargins.top）。
import { Primitive, drawTag } from './base.js';
import { COLORS } from '../config.js';

const BADGE_TOP = 34; // 标签顶边距（px），避开图表左上角的 OHLC 读数行

export class VertLine extends Primitive {
  constructor({ time, color, width = 2, dashed = false, label, labelColor }) {
    super('bottom');
    this._time = time;
    this._color = color;
    this._width = width;
    this._dashed = dashed;
    this._label = label;
    this._labelColor = labelColor;
    if (label) {
      this._views.push(this._makeView('top', (ctx, media) => this._drawBadge(ctx, media)));
    }
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

  _drawBadge(ctx, media) {
    const x = this._x(media);
    if (x === null) return;
    drawTag(ctx, x, BADGE_TOP, this._label, {
      bg: COLORS.tagBg,
      color: this._labelColor,
      anchor: 'tc',
    });
  }
}
