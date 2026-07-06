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

// 减半日（准确日期，画竖线，徽标统一置顶）
export const HALVINGS = [D('2016-07-09'), D('2020-05-11'), D('2024-04-20')];
// 减半的准确区块高度（区块模式下直接用常量，无需插值）
export const HALVING_HEIGHTS = [420000, 630000, 840000];

// 区块模式：K 线分桶粒度（约等于 日/周/月）
export const BLOCK_BUCKETS = { day: 144, week: 1008, month: 4368 };

// 减半周期：每 210,000 块一次
export const HALVING_INTERVAL = 210000;

// 狼波周期指数（纯区块制）：周期 = 210,000 块（减半到减半），牛三熊一 →
// 牛市 = 157,500 块且减半在正中间，即 减半 ± 78,750 块；熊市 = 其余 52,500 块。
// 不参考现实时间与实际价格顶底，整条锯齿仅由减半区块网格推导
export const WAVE_BULL_HALF = 78750;
// 区块模式下时间轴向预测终点之后延伸的块数（右侧留白，约 45 天）
export const EXTEND_MARGIN_BLOCKS = 6480;

// 周期规律：熊市 364 天，用于推算进行中熊市的预测见底日
export const BEAR_DAYS = 364;

// 时间轴在预测见底日之后再延伸的天数（右侧留白）
export const EXTEND_MARGIN_DAYS = 45;

// 箭头标签：'fixed' 用原图数字；'computed' 显示按实际枢轴算出的天数
export const ARROW_LABEL_MODE = 'fixed';
// 与周期段顺序一一对应：熊1、牛1、熊2、牛2、熊3、牛3、熊4(预测)
export const FIXED_ARROW_LABELS = ['413 天', '1064 天', '364 天', '1064 天', '364 天', '1064 天', '364 天'];

// 箭头相对框体的位置（对数坐标下用乘法偏移，视觉间距才恒定）
export const ARROW_BEAR_FACTOR = 1.25; // 熊市箭头 = 框顶价 × 1.25（悬于框上方）
export const ARROW_BULL_FACTOR = 0.78; // 牛市箭头 = 框底价 × 0.78（悬于框下方）

export const FONT = '"Inter", -apple-system, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif';

// 主题配色。K 线为绿涨红跌（国际惯例）；想改红涨绿跌，交换各主题的 up/down。
export const THEMES = {
  dark: {
    chartBg: '#0e1117',
    chartText: '#8b93a1',
    grid: 'rgba(139, 147, 161, 0.08)',
    scaleBorder: '#1e2530',
    up: '#089981',
    down: '#f23645',

    bullFill: 'rgba(8, 153, 129, 0.07)',
    bullBorder: 'rgba(8, 153, 129, 0.32)',
    bullLabel: '#27bd9b',
    bearFill: 'rgba(242, 54, 69, 0.06)',
    bearBorder: 'rgba(242, 54, 69, 0.30)',
    bearLabel: '#f7525f',

    // 进行中熊市的全高色带：需要明显可辨的红色高亮背景
    bandFill: 'rgba(242, 54, 69, 0.14)',
    bandFillProjected: 'rgba(242, 54, 69, 0.08)',

    halving: 'rgba(46, 107, 255, 0.55)',
    halvingLabel: '#7da3ff',

    today: 'rgba(139, 147, 161, 0.65)',
    todayLabel: '#aeb5c0',

    arrowBull: '#27bd9b',
    arrowBear: '#f7525f',

    phase: '#eab04d', // 狼波周期指数折线（0=熊底 → 1=牛顶）

    tagBg: 'rgba(14, 17, 23, 0.92)', // 标签胶囊统一底色

    watermark: 'rgba(228, 232, 240, 0.04)',
  },
  light: {
    chartBg: '#ffffff',
    chartText: '#767d8a',
    grid: 'rgba(70, 80, 96, 0.08)',
    scaleBorder: '#e2e6ee',
    up: '#089981',
    down: '#f23645',

    bullFill: 'rgba(8, 153, 129, 0.08)',
    bullBorder: 'rgba(8, 153, 129, 0.35)',
    bullLabel: '#079076',
    bearFill: 'rgba(242, 54, 69, 0.06)',
    bearBorder: 'rgba(242, 54, 69, 0.32)',
    bearLabel: '#e02a3a',

    // 进行中熊市的全高色带：需要明显可辨的红色高亮背景
    bandFill: 'rgba(242, 54, 69, 0.10)',
    bandFillProjected: 'rgba(242, 54, 69, 0.06)',

    halving: 'rgba(41, 98, 255, 0.50)',
    halvingLabel: '#2962ff',

    today: 'rgba(118, 125, 138, 0.70)',
    todayLabel: '#6a7180',

    arrowBull: '#079076',
    arrowBear: '#e02a3a',

    phase: '#c88a2d', // 狼波周期指数折线（0=熊底 → 1=牛顶）

    tagBg: 'rgba(255, 255, 255, 0.94)', // 标签胶囊统一底色

    watermark: 'rgba(22, 26, 34, 0.04)',
  },
};

// 运行时当前主题（setTheme 原地更新，标注在重建时读取最新值）
export const COLORS = { ...THEMES.dark };
export function setTheme(name) {
  Object.assign(COLORS, THEMES[name] ?? THEMES.dark);
}
