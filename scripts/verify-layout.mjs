/**
 * 布局断言：部件网格排列 + 徽章无残留方框 + 立绘无圆角。
 *   node scripts/verify-layout.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8088/';
const VIEWPORTS = [
  { name: '宽屏 1920', width: 1920, height: 1000, expectCols: 4 },
  { name: '宽屏 1440', width: 1440, height: 900, expectCols: 4 },
  { name: '宽屏 1280', width: 1280, height: 900, expectCols: 4 },
  { name: '中屏 1024', width: 1024, height: 800, expectCols: 2 },
  { name: '平板竖 820', width: 820, height: 1180, expectCols: 1 },
  { name: '手机竖 390', width: 390, height: 844, expectCols: 1 },
  { name: '手机横 844', width: 844, height: 390, expectCols: 1 },
];

let fail = 0;
const bad = (m) => { fail++; console.error(`  ✗ ${m}`); };
const good = (m) => console.log(`  ✓ ${m}`);

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
});

for (const vp of VIEWPORTS) {
  console.log(`\n═══ ${vp.name} ${vp.width}×${vp.height} ═══`);
  const page = await browser.newPage();
  await page.setViewport({ width: vp.width, height: vp.height });
  await page.goto(BASE, { waitUntil: 'networkidle2' });

  /* 网格列数 */
  const grid = await page.evaluate(() => {
    const ul = document.querySelector('.parts');
    const cols = getComputedStyle(ul).gridTemplateColumns.split(' ').filter(Boolean);
    const items = [...ul.querySelectorAll('.part')];
    const tops = new Set(items.map((el) => Math.round(el.getBoundingClientRect().top)));
    return {
      colCount: cols.length,
      cols: cols.map((c) => Math.round(parseFloat(c))),
      rows: tops.size,
      count: items.length,
    };
  });
  if (grid.colCount === vp.expectCols) good(`${grid.colCount} 列 × ${grid.rows} 行，${grid.count} 张卡`);
  else bad(`期望 ${vp.expectCols} 列，实际 ${grid.colCount} 列（${grid.cols.join('/')}）`);

  if (vp.expectCols === 4 && grid.rows !== 1) bad(`宽屏应一行排完，实际 ${grid.rows} 行`);
  if (vp.expectCols === 1 && grid.rows !== 4) bad(`单列应 4 行，实际 ${grid.rows} 行`);

  /* 列宽是否被拉得过大或过小 */
  if (vp.expectCols === 4) {
    const max = Math.max(...grid.cols), min = Math.min(...grid.cols);
    if (max / min > 1.05) bad(`四列宽度不均：${grid.cols.join(' / ')}`);
    else good(`列宽均匀 ${min}–${max}px`);
  }

  /* 同一行内卡片等高（宽屏/中屏必须；单列时各行只有一张，天然不等高） */
  const rows = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.parts .part')];
    const byTop = new Map();
    for (const el of items) {
      const t = Math.round(el.getBoundingClientRect().top);
      if (!byTop.has(t)) byTop.set(t, []);
      byTop.get(t).push({ kind: el.dataset.part, h: Math.round(el.getBoundingClientRect().height) });
    }
    return [...byTop.values()];
  });
  const uneven = rows.filter((g) => g.length > 1 && new Set(g.map((x) => x.h)).size > 1);
  if (uneven.length) bad(`同行卡片高度不一致: ${JSON.stringify(uneven)}`);
  else {
    const multi = rows.filter((g) => g.length > 1);
    if (!multi.length) good('单列布局：每行一张卡，按内容自然高度');
    else {
      const hs = [...new Set(multi.map((g) => g[0].h))];
      good(`${multi.length} 个多卡行全部等高（每行高度 ${hs.slice(0, 6).join('/')}${hs.length > 6 ? '…' : ''}，共 ${multi.length} 组）`);
    }
  }

  /* 立绘：无圆角、无背景图 */
  const portrait = await page.evaluate(() => {
    const el = document.querySelector('.monster__portrait');
    const cs = getComputedStyle(el);
    return { radius: cs.borderRadius, bgImage: cs.backgroundImage, bg: cs.backgroundColor };
  });
  if (portrait.radius !== '0px') bad(`立绘仍有圆角 ${portrait.radius}`);
  else if (portrait.bgImage !== 'none' || portrait.bg !== 'rgba(0, 0, 0, 0)') bad(`立绘仍有背景 ${portrait.bg}/${portrait.bgImage}`);
  else good('立绘无圆角、无背景，直接融入卡片');

  /* 徽章：遮罩生效，且徽章周围无异常方块 */
  const badge = await page.evaluate(() => {
    const out = [];
    for (const k of ['basic', 'm', 's1', 's2']) {
      const port = document.querySelector(`.part[data-part="${k}"] .badge__portrait`);
      const cs = getComputedStyle(port);
      const layers = (cs.maskImage.match(/url\(/g) ?? []).length;
      out.push({ k, mask: cs.maskImage, layers, composite: cs.maskComposite });
    }
    return out;
  });
  // 单层 mask-image 指向 mask-<kind>.png，且不依赖 mask-composite
  const unmasked = badge.filter(
    (x) => x.layers !== 1 || !x.mask.includes(`mask-${x.k}.png`) || /exclude|xor/.test(x.composite),
  );
  if (unmasked.length) bad(`徽章遮罩异常：${JSON.stringify(unmasked)}`);
  else good('四种徽章均为单层 mask（mask-<kind>.png），无 mask-composite 依赖');

  await page.close();
}

await browser.close();
console.log('');
if (fail) { console.error(`❌ ${fail} 项问题`); process.exit(1); }
console.log('✅ 布局全部符合预期');
