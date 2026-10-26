/**
 * UI 约定检查。
 *
 * 覆盖易被样式改动破坏、又难以目视发现的四条约定：
 *   1. 筛选组的「全部」为纯白
 *   2. 伤害类型枚举不含已被游戏合并的条目
 *   3. 筛选面板为半透明毛玻璃，且与顶栏同底色
 *   4. 搜索框只存在一个清除按钮
 */
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8088/';
let fail = 0;
const bad = (m) => { fail++; console.error(`  ✗ ${m}`); };
const good = (m) => console.log(`  ✓ ${m}`);

const b = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
});
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
await p.goto(BASE, { waitUntil: 'networkidle2' });

/* 1. 「全部」纯白 */
const allChip = await p.evaluate(() => {
  const c = document.querySelector('.chip--all:not([aria-pressed="true"])')
    || document.querySelector('.chip--all');
  const cs = getComputedStyle(c);
  return { color: cs.color, weight: cs.fontWeight, text: c.textContent.trim() };
});
if (allChip.color === 'rgb(255, 255, 255)') good(`「全部」为纯白 ${allChip.color}（${allChip.text}）`);
else bad(`「全部」颜色 ${allChip.color}，应为纯白`);

/* 2. 伤害类型只剩 9 项，且不含被合并的 6 个 */
await p.click('[data-filters-toggle]');
await new Promise((r) => setTimeout(r, 520));
const dmg = await p.evaluate(() => {
  const row = [...document.querySelectorAll('.filter-row')]
    .find((r) => r.querySelector('.filter-row__label')?.textContent.trim() === '伤害类型');
  return [...row.querySelectorAll('.chip')].map((c) => c.textContent.trim());
});
const removed = ['挥砍', '穿刺', '钝击', '雷', '雷鸣', '酸', '强酸', '毒', '毒素'];
const stillThere = dmg.filter((t) => removed.includes(t));
const expected = ['全部', '物理', '火焰', '寒冷', '闪电', '自然', '光耀', '死灵', '力场', '心灵', '治疗', '临时生命值'];
if (stillThere.length) bad(`伤害类型仍含已合并项: ${stillThere.join(', ')}`);
else good(`伤害类型无冗余项（${dmg.length} 项：${dmg.join(' ')}）`);
const missing = expected.filter((t) => !dmg.includes(t));
if (missing.length) bad(`伤害类型缺少: ${missing.join(', ')}`);
else good('应保留的 9 种伤害 + 治疗/临时生命值 均在');

/* 3. 面板毛玻璃：全程半透明 */
const panel = await p.evaluate(() => {
  const el = document.querySelector('[data-filters]');
  const cs = getComputedStyle(el);
  return {
    bg: cs.backgroundColor,
    backdrop: cs.backdropFilter || cs.webkitBackdropFilter,
    headerBg: getComputedStyle(document.querySelector('.site-top')).backgroundColor,
    headerBackdrop: getComputedStyle(document.querySelector('.site-top')).backdropFilter,
  };
});
const alpha = Number((panel.bg.match(/[\d.]+\)$/) ?? ['1)'])[0].replace(')', ''));
if (alpha < 1) good(`面板背景半透明 ${panel.bg}`);
else bad(`面板背景不透明 ${panel.bg}`);
if (/blur/.test(panel.backdrop)) good(`面板毛玻璃 ${panel.backdrop}`);
else bad(`面板缺 backdrop-filter: ${panel.backdrop}`);
if (panel.bg === panel.headerBg) good('与顶栏同一底色，展开/收起无突变');
else bad(`与顶栏底色不一致：面板 ${panel.bg} vs 顶栏 ${panel.headerBg}`);

/* 4. 搜索框只有一个清除按钮 */
const search = await p.evaluate(() => {
  const input = document.querySelector('[data-search]');
  const custom = document.querySelectorAll('[data-search-clear]').length;
  return { type: input.type, appNone: getComputedStyle(input, '::-webkit-search-cancel-button').appearance, custom };
});
if (search.custom !== 1) bad(`自定义清除按钮 ${search.custom} 个`);
else if (search.type === 'search') bad('输入框仍是 type=search（会叠加浏览器原生 X）');
else good(`自定义清除按钮 1 个，输入框 type=${search.type}（无原生 X）`);

await b.close();
console.log('');
if (fail) { console.error(`❌ ${fail} 项问题`); process.exit(1); }
console.log('✅ UI 约定全部成立');
