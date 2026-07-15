// 垂直网格线（区块刻度）：pane primitive，挂在面板上（不依赖任何系列的
// 可见性），与价格轴的水平网格线对称。内置时间轴已隐藏，图表库不会画
// 垂直网格，这里按底部区块轴的同一套刻度自绘，缩放平移时严格对齐。
import { timeToLogical, logicalToX } from './base.js';
import { COLORS } from '../config.js';

export class BlockGrid {
  // getTicks: () => number[]，返回当前可见范围的刻度高度（与区块轴共用）
  constructor(getTicks) {
    this._chart = null;
    this._getTicks = getTicks;
    this._views = [{
      update() {},
      zOrder: () => 'bottom',
      renderer: () => ({
        draw: (target) => {
          if (!this._chart) return;
          target.useMediaCoordinateSpace((scope) => this._draw(scope.context, scope.mediaSize));
        },
      }),
    }];
  }

  attached({ chart, requestUpdate }) {
    this._chart = chart;
    requestUpdate?.();
  }

  detached() {
    this._chart = null;
  }

  updateAllViews() {}

  paneViews() {
    return this._views;
  }

  _draw(ctx, media) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const h of this._getTicks()) {
      const x = logicalToX(this._chart, timeToLogical(h));
      if (x === null || x < 0 || x > media.width) continue;
      const px = Math.round(x) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, media.height);
    }
    ctx.stroke();
  }
}
