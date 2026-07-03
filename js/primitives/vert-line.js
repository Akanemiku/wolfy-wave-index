// 全高竖线 + 可选徽标：减半日（蓝实线）、今日分隔（灰虚线）。
import { Primitive } from './base.js';
import { FONT } from '../config.js';

export class VertLine extends Primitive {
  // labelY: 徽标中心的纵向位置（0~1，占面板高度比例）
  constructor({ time, color, width = 2, dashed = false, label, badgeBg, badgeText, labelY = 0.42 }) {
    super('bottom');
    this._time = time;
    this._color = color;
    this._width = width;
    this._dashed = dashed;
    this._label = label;
    this._badgeBg = badgeBg;
    this._badgeText = badgeText;
    this._labelY = labelY;
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

    if (!this._label) return;
    ctx.font = `bold 13px ${FONT}`;
    const w = ctx.measureText(this._label).width + 16;
    const h = 24;
    const bx = x - w / 2;
    const by = media.height * this._labelY - h / 2;
    ctx.fillStyle = this._badgeBg;
    ctx.beginPath();
    ctx.roundRect(bx, by, w, h, 5);
    ctx.fill();
    ctx.fillStyle = this._badgeText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this._label, x, by + h / 2 + 1);
  }
}
