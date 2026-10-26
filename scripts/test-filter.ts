#!/usr/bin/env node
/**
 * 筛选岛功能测试：加载 dist/index.html，挂上真实 DOM，模拟点击。
 * 需要一个已构建的 dist/（pnpm build）。
 */
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync(join(process.cwd(), 'dist', 'index.html'), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const { window } = dom;

/* 把 jsdom 的全局搬进 node 作用域，让 filter.ts 直接可用 */
const g = globalThis as Record<string, unknown>;
g.window = window;
g.document = window.document;
g.location = window.location;
g.history = window.history;
g.HTMLElement = window.HTMLElement;
g.Element = window.Element;

/* jsdom 缺的浏览器 API，补最小实现 */
if (!window.matchMedia) {
  (window as unknown as Record<string, unknown>).matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    dispatchEvent: () => false,
  });
}
if (!('ResizeObserver' in window)) {
  (window as unknown as Record<string, unknown>).ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
}
g.matchMedia = window.matchMedia;
g.ResizeObserver = (window as unknown as Record<string, unknown>).ResizeObserver;

let failures = 0;
const check = (name: string, cond: boolean, extra = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name} ${extra}`); }
};

/* 导入即初始化 */
await import('../src/client/filter.ts');
await new Promise((r) => setTimeout(r, 50));

const doc = window.document;
const monsters = () => Array.from(doc.querySelectorAll<HTMLElement>('.monster'));
const parts = (m: HTMLElement) => Array.from(m.querySelectorAll<HTMLElement>('.part'));
const shown = () => monsters().filter((m) => !m.hidden).length;
const shownParts = (m: HTMLElement) => parts(m).filter((p) => !p.hidden).length;
const chip = (group: string, value: string) =>
  doc.querySelector<HTMLButtonElement>(`.chip[data-group="${group}"][data-value="${value}"]`)!;
const url = () => window.location.search;

console.log('\n[1] 初始状态');
check('全部 76 个魔物可见', shown() === 76, `实际 ${shown()}`);
check('每卡 4 张部件可见', monsters().every((m) => shownParts(m) === 4));
check('每组「全部」默认按下', [...doc.querySelectorAll('.chip--all')].every((c) => c.getAttribute('aria-pressed') === 'true'));
check('取值 chip 默认未选中', [...doc.querySelectorAll('.chip:not(.chip--all)')].every((c) => c.getAttribute('aria-pressed') === 'false'));
check('URL 无 query', url() === '', url());

console.log('\n[2] 单选：种族=亡灵');
chip('race', 'undead').click();
const undead = monsters().filter((m) => m.dataset.race === 'undead').length;
check(`只显示亡灵 ${undead} 只`, shown() === undead, `实际 ${shown()}`);
check('chip 呈按下态', chip('race', 'undead').getAttribute('aria-pressed') === 'true');
check('URL 记录 race=undead', url().includes('race=undead'), url());

console.log('\n[3] 同组多选 = 并集：种族 亡灵+野兽');
chip('race', 'beast').click();
const rb = monsters().filter((m) => ['undead', 'beast'].includes(m.dataset.race)).length;
check(`显示 ${rb} 只（并集）`, shown() === rb, `实际 ${shown()}`);
check('URL 含两个值', /race=(undead|beast)%2C|race=\w+,\w+/.test(url()) || url().includes(','), url());

console.log('\n[4] 跨组 = 交集：再加上 等级=9');
chip('level', '9').click();
const both = monsters().filter((m) => ['undead', 'beast'].includes(m.dataset.race) && m.dataset.level === '9').length;
check(`显示 ${both} 只（交集）`, shown() === both, `实际 ${shown()}`);

console.log('\n[5] 部件级筛选：动作=反应');
for (const c of doc.querySelectorAll<HTMLButtonElement>('.chip[aria-pressed="true"]')) c.click();
chip('act', 'react').click();
const reactMonsters = monsters().filter((m) => !m.hidden);
check('至少命中 1 只', reactMonsters.length > 0, `实际 ${reactMonsters.length}`);
check('整卡模式：命中卡四张部件全显示', reactMonsters.every((m) => shownParts(m) === 4));

console.log('\n[6] 模式切换：只看命中部件');
const modeBtn = doc.querySelector<HTMLButtonElement>('[data-mode-toggle]')!;
modeBtn.click();
check('按钮呈按下态', modeBtn.getAttribute('aria-pressed') === 'true');
check('URL 带 mode=part', url().includes('mode=part'), url());
const partsOnly = monsters().filter((m) => !m.hidden);
check('命中卡片只显示反应部件', partsOnly.every((m) => {
  const vis = parts(m).filter((p) => !p.hidden);
  return vis.length > 0 && vis.every((p) => p.dataset.act === 'react');
}), JSON.stringify(partsOnly.slice(0,2).map((m) => parts(m).filter(p=>!p.hidden).map(p=>p.dataset.act))));

console.log('\n[7] 搜索：部件名关键词');
modeBtn.click(); // 回到整卡
for (const c of doc.querySelectorAll<HTMLButtonElement>('.chip[aria-pressed="true"]')) c.click();
const search = doc.querySelector<HTMLInputElement>('[data-search]')!;
search.value = '嘲讽';
search.dispatchEvent(new window.Event('input', { bubbles: true }));
await new Promise((r) => setTimeout(r, 250));
const hit = monsters().filter((m) => !m.hidden);
check('搜索命中至少 1 只', hit.length >= 1, `实际 ${hit.length}`);
check('命中卡确实含关键词', hit.every((m) => (m.textContent ?? '').includes('嘲讽')));

console.log('\n[8] 每组「全部」复位');
// 先制造一个多组选中状态
chip('race', 'undead').click();
chip('act', 'react').click();
await new Promise((r) => setTimeout(r, 30));
// 用「全部」逐组复位
doc.querySelector<HTMLButtonElement>('.chip--all[data-group="race"]')!.click();
await new Promise((r) => setTimeout(r, 30));
check('race 组「全部」按下', doc.querySelector('.chip--all[data-group="race"]')!.getAttribute('aria-pressed') === 'true');
check('race 条件已清除', !url().includes('race'), url());
doc.querySelector<HTMLButtonElement>('.chip--all[data-group="act"]')!.click();
await new Promise((r) => setTimeout(r, 30));
check('act 条件已清除', !url().includes('act'), url());
// 搜索框单独清（上一节留下的关键词）
search.value = '';
search.dispatchEvent(new window.Event('input', { bubbles: true }));
await new Promise((r) => setTimeout(r, 200));
check('URL 完全清空', url() === '', url());
check('恢复全部可见', shown() === 76, `实际 ${shown()}`);
check('所有「全部」均按下', [...doc.querySelectorAll('.chip--all')].every((c) => c.getAttribute('aria-pressed') === 'true'));

console.log('\n[9] URL 还原（分享链接 / 浏览器后退）');
// 模拟地址栏变化后触发 popstate：脚本应重新读取 URL
window.history.replaceState({}, '', '/?race=elf&level=7');
window.dispatchEvent(new window.PopStateEvent('popstate'));
await new Promise((r) => setTimeout(r, 50));
const elf7 = monsters().filter((m) => m.dataset.race === 'elf' && m.dataset.level === '7').length;
check(`从 URL 还原出 ${elf7} 只精灵7级`, shown() === elf7, `实际 ${shown()}`);
check('chip 同步为按下态', chip('race', 'elf').getAttribute('aria-pressed') === 'true');

console.log('');
if (failures) { console.error(`❌ ${failures} 项失败`); process.exit(1); }
console.log('✅ 全部通过');
