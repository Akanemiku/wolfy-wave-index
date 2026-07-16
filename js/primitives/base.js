// series primitive 公共骨架。
// 全部标注都是纯渲染（不实现 hitTest），因此天然不可选中、不可拖拽、不可编辑。
import { DAY, FONT } from '../config.js';

// setData 之后由 main.js 注入最终数据数组（真实 K 线 + whitespace）。
// 任意时间 → 逻辑坐标：二分找到所在的 K 线桶，桶内按时间比例插值，
// 因此日/周/月任何周期下标注都能精确定位（月线桶宽不均匀也没问题）。
// 不用 timeToCoordinate()：它对屏幕外的时间返回 null，会导致放大到
// 矩形内部时矩形消失。
let _times = [];

export function setSeriesData(data) {
  _times = data.map((c) => c.time);
}

export function timeToLogical(t) {
  const n = _times.length;
  if (n === 0) return 0;
  if (n === 1) return (t - _times[0]) / DAY;
  if (t <= _times[0]) {
    return (t - _times[0]) / (_times[1] - _times[0]);
  }
  if (t >= _times[n - 1]) {
    return n - 1 + (t - _times[n - 1]) / (_times[n - 1] - _times[n - 2]);
  }
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (_times[mid] <= t) lo = mid;
    else hi = mid;
  }
  return lo + (t - _times[lo]) / (_times[hi] - _times[lo]);
}

// 逻辑坐标 → 像素 x。lightweight-charts 的 logicalToCoordinate 只接受整数
// （小数会返回 0），周/月线下标注时间常落在 K 线桶中间产生小数逻辑坐标，
// 这里整数部分查库、小数部分按相邻两根 K 线的像素间距插值。
export function logicalToX(chart, logical) {
  const ts = chart.timeScale();
  const i = Math.floor(logical);
  const x0 = ts.logicalToCoordinate(i);
  if (x0 === null) return null;
  const frac = logical - i;
  if (frac === 0) return x0;
  const x1 = ts.logicalToCoordinate(i + 1);
  if (x1 === null) return null;
  return x0 + frac * (x1 - x0);
}

// 坐标钳制：远超屏幕的坐标收拢到视口 ±100px，避免画出巨型矩形
export const clamp = (v, max) => Math.max(-100, Math.min(max + 100, v));

// 统一的标签胶囊：全站所有浮动文字（牛市/熊市、减半日/今日、时长）共用一种
// 视觉语言——主题底色 + 细彩边 + 单色文字。anchor: 'tl' 左上 /
// 'tc' 顶部居中 / 'center' 完全居中（相对传入的 x,y）
export function drawTag(ctx, x, y, text, { bg, color, anchor = 'tl' }) {
  ctx.font = `600 11px ${FONT}`;
  const w = Math.ceil(ctx.measureText(text).width) + 16;
  const h = 20;
  let bx = x;
  let by = y;
  if (anchor === 'tc') { bx = x - w / 2; }
  else if (anchor === 'center') { bx = x - w / 2; by = y - h / 2; }
  ctx.beginPath();
  // 与页面控件同体系的微圆角；旧浏览器无 roundRect 时退化为直角
  if (ctx.roundRect) ctx.roundRect(bx, by, w, h, 4);
  else ctx.rect(bx, by, w, h);
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

  attached({ chart, series, requestUpdate }) {
    this._chart = chart;
    this._series = series;
    this._requestUpdate = requestUpdate;
    // 挂载后立即请求重绘：否则要等下一次交互（如鼠标移入）才会显示
    requestUpdate?.();
  }

  detached() {
    // 卸载同样立即重绘，让标注马上消失
    this._requestUpdate?.();
    this._requestUpdate = null;
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
    return logicalToX(this._chart, timeToLogical(t));
  }

  priceToY(p) {
    return this._series.priceToCoordinate(p);
  }
}
