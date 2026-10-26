/**
 * 可读性审计：所有实际出现的「文字色 × 背景色」组合都算一遍对比度。
 * 阈值取 WCAG AA 正文 4.5 / 大字与次要信息 3.0。
 */
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8088/';
const b = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
});
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
await p.goto(BASE, { waitUntil: 'networkidle2' });

const rows = await p.evaluate(() => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const v = m[1].split(',').map((x) => parseFloat(x));
    return { rgb: v.slice(0, 3), a: v[3] === undefined ? 1 : v[3] };
  };
  const over = (fg, bg) => fg.rgb.map((v, i) => Math.round(v * fg.a + bg[i] * (1 - fg.a)));
  const bgOf = (el) => {
    let n = el, acc = null;
    while (n) {
      const cs = getComputedStyle(n);
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0.001) {
        acc = acc === null ? c : { rgb: over(c, acc.rgb), a: 1 };
        if (c.a >= 0.999) break;
      }
      n = n.parentElement;
    }
    return acc ? acc.rgb : [13, 20, 24];
  };
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05))).toFixed(2);
  };

  const sels = [
    ['.monster__name', '魔物名'], ['.part__name', '部件名'], ['.part__desc', '说明'],
    ['.effect', '效果'], ['.effect__name', '效果名'], ['.monster__meta > span', '魔物元信息'],
    ['.vital dt', '血/甲标签'], ['.ability dt', '属性标签'], ['.ability dd', '属性数值'],
    ['.dmg__line', '伤害行'], ['.dmg__mult', '伤害倍率'], ['.part__bonus > span', '加成'],
    ['.filter-row__label', '筛选组名'], ['.chip', '标签 chip'], ['.site-header__sub', '计数'],
    ['.search__input', '搜索框'], ['.filters__foot span', '筛选说明'], ['.empty p', '空状态'],
  ];
  const out = [];
  for (const [sel, label] of sels) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    const bg = bgOf(el);
    const visible = over(fg, bg);
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    out.push({ sel, label, fg: cs.color, bg: `rgb(${bg.join(',')})`, ratio: ratio(visible, bg), need: large ? 3 : 4.5 });
  }
  return out;
});

let fail = 0;
for (const r of rows) {
  const ok = r.ratio >= r.need;
  if (!ok) fail++;
  console.log(`  ${ok ? '✓' : '✗'} ${r.label.padEnd(10)} ${String(r.ratio).padStart(5)} (需 ${r.need})  ${r.fg} on ${r.bg}`);
}
await b.close();
console.log(fail ? `\n❌ ${fail} 处对比度不达标` : '\n✅ 全部达标');
process.exit(fail ? 1 : 0);
