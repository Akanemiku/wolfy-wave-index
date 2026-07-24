// 全高竖线：减半日（蓝）、今日分隔（灰虚线）。
// 线画在 'normal' 层；可选标签为沿线竖排的小字（事件线的经典标注法）：
// 贴着线右侧从面板顶部向下书写，几乎不占横向空间、不与顶部读数行冲突。
import { Primitive } from './base.js';
import { FONT } from '../config.js';

export class VertLine extends Primitive {
  constructor({ time, color, width = 1.5, dashed = false, label, labelColor }) {
    super('bottom'); // 线画在最底层：填充与数据都在其上，不遮挡任何内容
    this._time = time;
    this._color = color;
    this._width = width;
    this._dashed = dashed;
    this._label = label;
    this._labelColor = labelColor;
    if (label) {
      // 标签画在数据之下（'bottom'）：价格折线永远在标签之上，不被遮挡
      this._views.push(this._makeView('bottom', (ctx, media) => this._drawLabel(ctx, media)));
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

  _drawLabel(ctx, media) {
    const x = this._x(media);
    if (x === null) return;
    ctx.save();
    ctx.font = `600 10.5px ${FONT}`;
    ctx.fillStyle = this._labelColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    // 旋转 90°：文字沿线向下书写，字形中线落在线右侧 8px 处；
    // 起点避开左上角的系列读数行（BTC/USD）
    ctx.translate(x + 8, 36);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(this._label, 0, 0);
    ctx.restore();
  }
}
