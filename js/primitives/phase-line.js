// 周期相位折线：0 = 熊底，1 = 牛顶。牛市段线性上行（约三年），
// 熊市段线性下行（约一年），锯齿状叠印在 K 线图上。
// y 轴用绘图区像素比例（与价格坐标无关），对数/线性切换不影响形态。
// 「今日」之前实线，之后（预测段）虚线，并在今日位置标出当前相位百分比。
import { Primitive, drawTag } from './base.js';
import { COLORS } from '../config.js';

const Y_TOP = 0.10;    // value=1（牛顶）对应的面板高度比例
const Y_BOTTOM = 0.96; // value=0（熊底）对应的面板高度比例

export class PhaseLine extends Primitive {
  // points: [{ pos, value }] 按 pos 升序；splitAt: 今日位置
  constructor({ points, splitAt, color }) {
    super('top');
    this._points = points;
    this._splitAt = splitAt;
    this._color = color;
  }

  _valueAt(pos) {
    const p = this._points;
    if (pos <= p[0].pos) return p[0].value;
    for (let i = 0; i + 1 < p.length; i++) {
      if (pos <= p[i + 1].pos) {
        const f = (pos - p[i].pos) / (p[i + 1].pos - p[i].pos);
        return p[i].value + f * (p[i + 1].value - p[i].value);
      }
    }
    return p.at(-1).value;
  }

  _draw(ctx, media) {
    const yFor = (v) => media.height * (Y_TOP + (1 - v) * (Y_BOTTOM - Y_TOP));
    const xy = (pos, v) => ({ x: this.timeToX(pos), y: yFor(v) });
    const split = Math.max(this._points[0].pos, Math.min(this._splitAt, this._points.at(-1).pos));
    const splitVal = this._valueAt(split);
    const splitPt = xy(split, splitVal);

    const past = [];
    const future = [];
    for (const p of this._points) {
      (p.pos <= split ? past : future).push(xy(p.pos, p.value));
    }
    past.push(splitPt);
    future.unshift(splitPt);

    ctx.save();
    ctx.strokeStyle = this._color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.9;
    ctx.lineJoin = 'round';
    const drawPath = (pts, dashed) => {
      const valid = pts.filter((p) => p.x !== null);
      if (valid.length < 2) return;
      ctx.setLineDash(dashed ? [5, 4] : []);
      ctx.beginPath();
      ctx.moveTo(valid[0].x, valid[0].y);
      for (let i = 1; i < valid.length; i++) ctx.lineTo(valid[i].x, valid[i].y);
      ctx.stroke();
    };
    drawPath(past, false);
    drawPath(future, true);
    ctx.setLineDash([]);
    ctx.restore();

    // 今日相位：圆点 + 百分比标签（0% = 熊底，100% = 牛顶）
    if (splitPt.x !== null && splitPt.x >= -20 && splitPt.x <= media.width + 20) {
      ctx.fillStyle = this._color;
      ctx.beginPath();
      ctx.arc(splitPt.x, splitPt.y, 3, 0, Math.PI * 2);
      ctx.fill();
      drawTag(ctx, splitPt.x - 8, splitPt.y, `相位 ${Math.round(splitVal * 100)}%`, {
        bg: COLORS.tagBg, color: this._color, anchor: 'rc',
      });
    }
  }
}
