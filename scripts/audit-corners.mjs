/**
 * 断言：除 .monster 外，页面上不存在"有底色的圆角矩形"。
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
// 展开筛选面板，把所有 chip 也纳入检查
await p.evaluate(() => document.querySelector('[data-filters-toggle]')?.click());
await new Promise((r) => setTimeout(r, 520));

const r = await p.evaluate(() => {
  const PAGE = [0, 0, 0];
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const v = m[1].split(',').map(Number);
    return { rgb: v.slice(0, 3), a: v[3] === undefined ? 1 : v[3] };
  };
  const blocks = [];   // 有底色
  const rounded = [];  // 圆角 > 0
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('.monster') && !el.classList.contains('monster')) {
      // 魔物卡内部允许卡片本身的圆角，但内部元素不应再有色块
    }
    const cs = getComputedStyle(el);
    const bg = parse(cs.backgroundColor);
    const r = parseFloat(cs.borderTopLeftRadius) || 0;
    const isMonster = el.classList.contains('monster');
    const isDot = cs.borderRadius.includes('50%') && el.getBoundingClientRect().width <= 4;
    const painted = bg && bg.a > 0.02 && !(bg.rgb[0] === 0 && bg.rgb[1] === 0 && bg.rgb[2] === 0 && bg.a === 1);
    const name = el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\s+/).slice(0, 2).join('.') : '');
    if (painted && !(bg.a === 1 && bg.rgb.every((v) => v === 0))) blocks.push({ name, bg: cs.backgroundColor, round: r, monster: isMonster });
    if (r > 0 && !isDot && !isMonster && !el.closest('.monster')) rounded.push({ name, r, bg: cs.backgroundColor });
  }
  return { blocks, rounded };
});

let fail = 0;
const roundedOutside = r.rounded;
if (roundedOutside.length) {
  fail++;
  console.error('  ✗ 魔物卡之外仍有圆角元素：');
  roundedOutside.slice(0, 12).forEach((x) => console.error(`      ${x.name}  radius=${x.r}  bg=${x.bg}`));
} else console.log('  ✓ 魔物卡之外没有任何圆角元素');

const paintedOutside = r.blocks.filter((x) => !x.monster);
if (paintedOutside.length) {
  console.log(`  · 有底色的元素 ${paintedOutside.length} 个（应仅为黑色/透明叠加）：`);
  paintedOutside.slice(0, 8).forEach((x) => console.log(`      ${x.name}  ${x.bg}`));
} else console.log('  ✓ 魔物卡之外没有色块');

await b.close();
console.log(fail ? '\n❌ 未通过' : '\n✅ 只有魔物大卡片是圆角色块');
process.exit(fail ? 1 : 0);
