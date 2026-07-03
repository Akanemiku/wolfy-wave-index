// series primitive 公共骨架。
// 全部标注都是纯渲染（不实现 hitTest），因此天然不可选中、不可拖拽、不可编辑。
import { DAY, FONT } from '../config.js';

// setData 之后由 main.js 注入最终数据数组（真实 K 线 + whitespace），
// 用「时间 → 数组下标」查表求逻辑坐标。不用 timeToCoordinate()：
// 它对滚出屏幕外的时间返回 null，会导致放大到矩形内部时矩形消失。
let _firstTime = 0;
let _index = new Map();

export function setSeriesData(data) {
  _firstTime = data[0].time;
  _index = new Map(data.map((c, i) => [c.time, i]));
}

export function timeToLogical(t) {
  const i = _index.get(t);
  if (i !== undefined) return i;
  return (t - _firstTime) / DAY; // 范围外的时间按逐日连续推算
}

// 坐标钳制：远超屏幕的坐标收拢到视口 ±100px，避免画出巨型矩形
export const clamp = (v, max) => Math.max(-100, Math.min(max + 100, v));

// 统一的标签胶囊：全站所有浮动文字（牛市/熊市、减半日/今日、时长）共用一种
// 视觉语言——主题底色 + 细彩边 + 单色文字。anchor: 'tl' 左上 / 'bl' 左下 /
// 'tc' 顶部居中 / 'center' 完全居中（相对传入的 x,y）
export function drawTag(ctx, x, y, text, { bg, color, anchor = 'tl' }) {
  ctx.font = `600 11px ${FONT}`;
  const w = Math.ceil(ctx.measureText(text).width) + 16;
  const h = 20;
  let bx = x;
  let by = y;
  if (anchor === 'tc') { bx = x - w / 2; }
  else if (anchor === 'bl') { by = y - h; }
  else if (anchor === 'center') { bx = x - w / 2; by = y - h / 2; }
  ctx.beginPath();
  roundedRectPath(ctx, bx, by, w, h, 4);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + w / 2, by + h / 2 + 0.5);
}

// 圆角矩形路径：旧版 Safari(<16)/Firefox(<112) 没有 ctx.roundRect，
// 直接调用会抛 TypeError 中断整个 primitive 绘制过程
export function roundedRectPath(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class Primitive {
  constructor(zOrder = 'normal') {
    this._chart = null;
    this._series = null;
    this._views = [this._makeView(zOrder, (ctx, media) => this._draw(ctx, media))];
  }

  _makeView(zOrder, drawFn) {
    const self = this;
    return {
      update() {},
      zOrder: () => zOrder,
      renderer: () => ({
        draw: (target) => {
          if (!self._chart || !self._series) return;
          target.useMediaCoordinateSpace((scope) => drawFn(scope.context, scope.mediaSize));
        },
      }),
    };
  }

  attached({ chart, series }) {
    this._chart = chart;
    this._series = series;
  }

  detached() {
    this._chart = null;
    this._series = null;
  }

  updateAllViews() {}

  paneViews() {
    return this._views;
  }

  // 让自动缩放把标注也纳入价格范围（否则悬于框外的箭头/气泡会被裁出视口）。
  // 子类提供 _range() → { fromTime, toTime, minPrice, maxPrice }，不参与则返回 null。
  // 深度放大（标注时间跨度只有一小部分可见）时不干预，让 K 线正常自动缩放。
  autoscaleInfo(startLogical, endLogical) {
    const r = this._range?.();
    if (!r) return null;
    const a = timeToLogical(r.fromTime);
    const b = timeToLogical(r.toTime);
    if (b < startLogical || a > endLogical) return null;
    const span = b - a;
    if (span > 0) {
      const covered = Math.min(b, endLogical) - Math.max(a, startLogical);
      if (covered / span < 0.5) return null;
    }
    return { priceRange: { minValue: r.minPrice, maxValue: r.maxPrice } };
  }

  timeToX(t) {
    return this._chart.timeScale().logicalToCoordinate(timeToLogical(t));
  }

  priceToY(p) {
    return this._series.priceToCoordinate(p);
  }
}
