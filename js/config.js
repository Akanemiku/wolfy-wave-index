// ★ 全站唯一需要调整的配置文件 ★
// 顶底日期不在这里硬编码——牛顶 = 窗口内最高价那天，熊底 = 窗口内最低价那天，
// 由 pivots.js 从实际行情数据中自动算出。这里只给"粗略搜索窗口"。

export const DAY = 86400;

// 'YYYY-MM-DD' → UTC 零点 unix 秒。全站时间一律用 UTC 秒（数字），不要用日期字符串。
export const D = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 1000;
};

// 枢轴搜索窗口：按顶→底→顶…交替；每个窗口的起点 = 上一个枢轴的日期，
// 这里只需给出窗口的结束日期（最后一个窗口到最新数据为止）。
export const PIVOT_WINDOWS = [
  { type: 'top',    from: D('2013-01-01'), to: D('2014-06-30') }, // ≈2013-11-30
  { type: 'bottom', to: D('2016-01-31') },                        // ≈2015-01-14
  { type: 'top',    to: D('2018-06-30') },                        // ≈2017-12-17
  { type: 'bottom', to: D('2019-12-31') },                        // ≈2018-12-15
  { type: 'top',    to: D('2022-06-30') },                        // ≈2021-11-10
  { type: 'bottom', to: D('2023-06-30') },                        // ≈2022-11-21
  { type: 'top',    to: Infinity },                               // 进行中周期的历史最高 ≈2025-10-06
];

// 减半日（准确日期，画蓝色竖线）。labelY 可选：徽标纵向位置（0~1，默认 0.42），
// 用于避开与其他标注的重叠
export const HALVINGS = [
  { date: D('2016-07-09') },
  { date: D('2020-05-11'), labelY: 0.30 },
  { date: D('2024-04-20') },
];

// 周期规律：熊市 364 天，用于推算进行中熊市的预测见底日
export const BEAR_DAYS = 364;

// 时间轴在预测见底日之后再延伸的天数（右侧留白）
export const EXTEND_MARGIN_DAYS = 45;

// 箭头标签：'fixed' 忠实还原原图数字；'computed' 显示按实际枢轴算出的天数
export const ARROW_LABEL_MODE = 'fixed';
// 与周期段顺序一一对应：熊1、牛1、熊2、牛2、熊3、牛3、熊4(预测)
export const FIXED_ARROW_LABELS = ['413 天', '1064 天', '364 天', '1064 天', '364 天', '1064 天', '364 天'];

// 箭头相对框体的位置（对数坐标下用乘法偏移，视觉间距才恒定）
export const ARROW_BEAR_FACTOR = 1.25; // 熊市红箭头 = 框顶价 × 1.25（悬于框上方）
export const ARROW_BULL_FACTOR = 0.78; // 牛市绿箭头 = 框底价 × 0.78（悬于框下方）

export const COLORS = {
  // K 线：绿涨红跌（同原图，西式配色）。想改成红涨绿跌，交换 up/down 两行即可。
  up: '#26a69a',
  down: '#ef5350',

  bullFill: 'rgba(76, 175, 80, 0.10)',
  bearFill: 'rgba(239, 83, 80, 0.09)',
  boxBorder: 'rgba(55, 60, 70, 0.55)',
  boxLabel: '#131722',

  halving: '#7ba2e8',       // 减半日竖线
  halvingBadgeBg: '#aec6ef',
  halvingBadgeText: '#1a2233',

  today: '#787b86',         // 「今日」分隔虚线

  arrowBear: '#f23645',
  arrowBull: '#089981',

  calloutBg: 'rgba(255, 255, 255, 0.94)',
  calloutBorder: '#131722',
  calloutText: '#131722',
};

export const FONT = '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
