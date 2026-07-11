// 轻量中英文字典。t(key, ...args) 取当前语言文案，函数型条目用于带参数拼接。
export const STRINGS = {
  zh: {
    brand: '狼波周期指数',
    tfDay: '144 区块',
    tfWeek: '1,008 区块',
    tfMonth: '4,368 区块',
    styleCandles: 'K线',
    styleLine: '折线',
    styleWave: '狼波着色',
    log: '对数',
    linear: '线性',
    marks: '标注',
    waveLabel: '狼波指数',
    halving: '减半日',
    today: '今日',
    bull: '牛市',
    bear: '熊市',
    proj: (label) => `${label}（预测）`,
    paneTitle: (v) => `狼波周期指数 Wolfy Wave Index　${v}　（0 = 熊底 · 1 = 牛顶）`,
    watermark: ['狼波周期指数', 'Wolfy Wave Index'],
    statCycle: (x, y) => `熊市 第 <b>${x}</b> / ${y} 区块`,
    statBottom: (z, h) => `距预测见底 <b>${z}</b> 区块（高度 ${h}）`,
    statBottomOver: (z) => `已超过预测见底高度 <b>${z}</b> 区块`,
    legendHead: (n, d) => `区块 ${n}　≈${d}`,
    legendOHLC: ['开', '高', '低', '收'],
    footData: '数据来源：Bitstamp / Coinbase Exchange',
    footTheory: '牛市 157,500 区块 / 熊市 52,500 区块，减半在牛市正中',
    footDisclaimer: '周期理论仅供参考，不构成投资建议',
    loading: '加载行情数据中…',
    loadFailData: (msg) => `历史数据加载失败：${msg}`,
    loadFailInit: (msg) => `页面初始化失败：${msg}`,
    noticeStale: (d) => `实时数据加载失败，当前显示截至 ${d} 的历史数据。`,
  },
  en: {
    brand: 'Wolfy Wave Index',
    tfDay: '144 blk',
    tfWeek: '1,008 blk',
    tfMonth: '4,368 blk',
    styleCandles: 'Candles',
    styleLine: 'Line',
    styleWave: 'Wave Color',
    log: 'Log',
    linear: 'Linear',
    marks: 'Marks',
    waveLabel: 'Wave Index',
    halving: 'Halving',
    today: 'Today',
    bull: 'Bull',
    bear: 'Bear',
    proj: (label) => `${label} (proj.)`,
    paneTitle: (v) => `Wolfy Wave Index　${v}　(0 = bottom · 1 = top)`,
    watermark: ['Wolfy Wave Index'],
    statCycle: (x, y) => `Bear · block <b>${x}</b> / ${y}`,
    statBottom: (z, h) => `Est. bottom in <b>${z}</b> blocks (height ${h})`,
    statBottomOver: (z) => `<b>${z}</b> blocks past est. bottom`,
    legendHead: (n, d) => `Block ${n}　≈${d}`,
    legendOHLC: ['O', 'H', 'L', 'C'],
    footData: 'Data: Bitstamp / Coinbase Exchange',
    footTheory: 'Bull 157,500 blocks / Bear 52,500 blocks · halving at bull midpoint',
    footDisclaimer: 'Cycle theory for reference only — not investment advice',
    loading: 'Loading market data…',
    loadFailData: (msg) => `Failed to load historical data: ${msg}`,
    loadFailInit: (msg) => `Initialization failed: ${msg}`,
    noticeStale: (d) => `Live data unavailable — showing history up to ${d}.`,
  },
};

export const I18N = { lang: 'zh' };

export function setLang(lang) {
  I18N.lang = STRINGS[lang] ? lang : 'zh';
}

export function t(key, ...args) {
  const v = STRINGS[I18N.lang][key] ?? STRINGS.zh[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}
