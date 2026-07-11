// 全高竖线：减半日（蓝）、今日分隔（灰虚线）。
// 线画在 'normal' 层（网格之上）；可选标签用图内胶囊（与牛熊市标签同款）
// 钉在竖线顶端、OHLC 读数行之下，画在 'top' 层保持可读。
import { Primitive, drawTag } from './base.js';
import { COLORS } from '../config.js';

const TAG_TOP = 32; // 标签纵向位置（px）：贴住面板顶部、避开 OHLC 读数行

export class VertLine extends Primitive {
  // labelOnly：只画顶部标签、不画线（线由别处负责，如「今日」的持久引导线）
  constructor({ time, color, width = 1.5, dashed = false, label, labelColor, labelOnly = false }) {
    super('normal');
    this._time = time;
    this._color = color;
    this._width = width;
    this._dashed = dashed;
    this._label = label;
    this._labelColor = labelColor;
    this._labelOnly = labelOnly;
    if (label) {
      this._views.push(this._makeView('top', (ctx, media) => this._drawLabel(ctx, media)));
    }
  }

  _x(media) {
    const x = this.timeToX(this._time);
    if (x === null || x < -10 || x > media.width + 10) return null;
    return x;
  }

  _draw(ctx, media) {
    if (this._labelOnly) return;
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

  _drawLabel(ctx, media) {
    const x = this._x(media);
    if (x === null) return;
    drawTag(ctx, x, TAG_TOP, this._label, {
      bg: COLORS.tagBg,
      color: this._labelColor,
      anchor: 'tc',
    });
  }
}
