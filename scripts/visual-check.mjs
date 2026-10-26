/**
 * 真实浏览器布局断言（headless Chromium + puppeteer-core）。
 *
 *   node scripts/visual-check.mjs [baseUrl]
 *
 * 检查：图片是否加载、横向溢出、文字被裁切、点击区域过小、对比度、筛选后布局。
 */
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8088/';
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1024, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];

let fail = 0;
const bad = (m) => { fail++; console.error(`  ✗ ${m}`); };
const good = (m) => console.log(`  ✓ ${m}`);

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--font-render-hinting=none'],
});

for (const vp of VIEWPORTS) {
  console.log(`\n═══ ${vp.name} ${vp.width}×${vp.height} ═══`);
  const page = await browser.newPage();
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });

  /* 1. 图片全部真的加载成功（lazy 图需滚过一遍才会加载） */
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 30));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForNetworkIdle({ idleTime: 400, timeout: 30000 }).catch(() => {});
  const imgs = await page.evaluate(() => {
    // 收起状态的面板里 lazy 图不会被加载，这是正确行为，不计入失败
    const inHiddenPanel = (img) => {
      const panel = img.closest('[data-filters]');
      if (!panel) return false;
      const cs = getComputedStyle(panel);
      return cs.visibility === 'hidden' || cs.opacity === '0';
    };
    const list = [...document.images];
    const relevant = list.filter((i) => !inHiddenPanel(i));
    return {
      total: relevant.length,
      skipped: list.length - relevant.length,
      broken: relevant.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute('src')),
      noDims: relevant.filter((i) => !i.getAttribute('width') || !i.getAttribute('height')).map((i) => i.getAttribute('src')).slice(0, 5),
    };
  });
  if (imgs.broken.length) bad(`${imgs.broken.length} 张图加载失败: ${imgs.broken.slice(0, 4).join(', ')}`);
  else good(`${imgs.total} 张可见图全部加载成功${imgs.skipped ? `（面板收起时跳过 ${imgs.skipped} 张懒加载图标）` : ''}`);
  if (imgs.noDims.length) bad(`缺少宽高（会抖动）: ${imgs.noDims.join(', ')}`);
  else good('所有 img 带 width/height');

  /* 2. 横向溢出 */
  const overflow = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.right > vw + 1.5 || r.left < -1.5) {
        offenders.push({
          sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
          left: Math.round(r.left), right: Math.round(r.right),
        });
      }
    }
    return { vw, scrollW: document.documentElement.scrollWidth, offenders: offenders.slice(0, 6) };
  });
  if (overflow.scrollW > overflow.vw + 1) bad(`页面横向溢出：scrollWidth ${overflow.scrollW} > viewport ${overflow.vw}`);
  else good(`无横向溢出（${overflow.scrollW}px）`);
  if (overflow.offenders.length) console.log('    越界元素:', JSON.stringify(overflow.offenders));

  /* 3. 文字被裁切（省略号/overflow hidden 导致的丢字） */
  const clipped = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('.part__name, .part__desc, .dmg__line, .effect, .monster__name, .vital dt')) {
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).textOverflow !== 'ellipsis') {
        out.push(el.className + ': ' + el.textContent.trim().slice(0, 24));
      }
      if (el.scrollHeight > el.clientHeight + 2 && getComputedStyle(el).overflow === 'hidden') {
        out.push('v-clip ' + el.className + ': ' + el.textContent.trim().slice(0, 24));
      }
    }
    return out.slice(0, 6);
  });
  if (clipped.length) bad(`文字被裁切: ${JSON.stringify(clipped)}`);
  else good('无文字裁切');

  /* 4. 关键元素的实测尺寸 */
  const metrics = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const box = (s) => { const e = q(s); if (!e) return null; const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
    return {
      header: box('.site-top'),
      headerSticky: getComputedStyle(q('.site-top')).position,
      monster: box('.monster'),
      portrait: box('.monster__portrait'),
      abilityCell: box('.ability'),
      badge: box('.badge'),
      partsCols: getComputedStyle(q('.parts')).gridTemplateColumns,
      partCols: (() => { const p = q('.part:not([data-part="basic"])'); return p ? Math.round(p.getBoundingClientRect().width) : 0; })(),
      basicCols: getComputedStyle(q('.part[data-part="basic"]')).gridTemplateColumns,
      chipH: box('.chip')?.h,
      chipMin: Math.min(...[...document.querySelectorAll('.chip')].map((c) => c.getBoundingClientRect().height)),
      searchW: box('.search__input')?.w,
      fontSize: getComputedStyle(document.body).fontSize,
    };
  });
  console.log('    尺寸:', JSON.stringify(metrics));
  if (metrics.headerSticky !== 'sticky') bad(`顶栏不是 sticky（${metrics.headerSticky}）`);
  else good('顶栏 sticky 生效');

  /* 4a. 关键元素不被其他元素遮挡（grid-area 冲突 / 绝对定位重叠） */
  const covered = await page.evaluate(() => {
    const m = document.querySelector('.monster');
    if (!m) return [{ sel: '.monster', problem: '缺失' }];
    const out = [];
    for (const sel of ['.monster__portrait img', '.monster__name', '.monster__abilities', '.monster__vitals', '.part .part__name']) {
      const el = m.querySelector(sel);
      if (!el) { out.push({ sel, problem: '缺失' }); continue; }
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) { out.push({ sel, problem: '尺寸为 0' }); continue; }
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      if (!(hit && (el === hit || el.contains(hit) || hit.contains(el)))) {
        out.push({ sel, problem: `被 ${hit?.className || hit?.tagName || '?'} 遮挡` });
      }
    }
    return out;
  });
  if (covered.length) bad(`元素被遮挡: ${JSON.stringify(covered)}`);
  else good('头部/属性/血条/部件标题均未被遮挡');

  /* 4a-2. 加成与正文中的图标必须被约束成文字大小 */
  const bigIcons = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('.part__bonus img, .part__desc img, .effect img, .dmg__line img')) {
      const r = el.getBoundingClientRect();
      const fs = parseFloat(getComputedStyle(el.closest('.part__bonus, .part__desc, .effect, .dmg__line')).fontSize);
      if (r.height > fs * 1.8) out.push(`${el.getAttribute('src')}: ${Math.round(r.height)}px vs 字号 ${fs}px`);
    }
    return out.slice(0, 4);
  });
  if (bigIcons.length) bad(`图标撑爆版式: ${bigIcons.join('; ')}`);
  else good('行内图标尺寸均随字号受控');

  /* 4b. 悬浮筛选面板（全尺寸统一） */
  {
    const closed = await page.evaluate(() => document.querySelector('[data-filters]').hasAttribute('hidden'));
    if (!closed) bad('筛选面板应默认收起');
    else good('筛选面板默认收起');

    await page.click('[data-filters-toggle]');
    await new Promise((r) => setTimeout(r, 520));   // 等收起/展开动画走完
    const panel = await page.evaluate(() => {
      const p = document.querySelector('[data-filters]');
      const r = p.getBoundingClientRect();
      const chips = [...p.querySelectorAll('.chip')];
      const hs = chips.map((c) => Math.round(c.getBoundingClientRect().height)).filter((h) => h > 0);
      return {
        visible: !p.hasAttribute('hidden'),
        top: Math.round(r.top), bottom: Math.round(r.bottom),
        vh: window.innerHeight,
        scrollable: p.scrollHeight > p.clientHeight,
        chipCount: hs.length,
        chipMin: hs.length ? Math.min(...hs) : 0,
        expanded: document.querySelector('[data-filters-toggle]').getAttribute('aria-expanded'),
      };
    });
    if (!panel.visible) bad('点击后筛选面板未展开');
    else if (panel.top < 0) bad(`面板顶部越界（top=${panel.top}）`);
    else good(`面板展开：top=${panel.top} 高至 ${panel.bottom}/${panel.vh}px，${panel.chipCount} 个 chip 可见`);
    if (panel.chipMin && panel.chipMin < 28) bad(`chip 触控高度 ${panel.chipMin}px < 28px`);
    else if (panel.chipMin) good(`chip 触控高度 ${panel.chipMin}px`);
    if (panel.expanded !== 'true') bad('aria-expanded 未同步');

    // 展开态下再查一次横向溢出
    const ovf = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      vw: document.documentElement.clientWidth,
    }));
    if (ovf.sw > ovf.vw + 1) bad(`面板展开后横向溢出 ${ovf.sw} > ${ovf.vw}`);
    else good('面板展开后无横向溢出');

    await page.click('[data-filters-toggle]');
    await new Promise((r) => setTimeout(r, 520));
  }

  /* 5. 触控目标尺寸（移动端至少 32px 高） */
  if (vp.width <= 768) {
    await page.click('[data-filters-toggle]');
    await new Promise((r) => setTimeout(r, 520));
    const small = await page.evaluate(() => {
      const out = [];
      for (const btn of document.querySelectorAll('.chip, .btn, .search__clear, .to-top')) {
        const r = btn.getBoundingClientRect();
        if (r.height > 0 && r.height < 28) out.push(`${btn.className.split(' ')[0]}:${Math.round(r.height)}px`);
      }
      return out;
    });
    if (small.length) bad(`触控目标过小: ${small.slice(0, 6).join(' ')}`);
    else good('触控目标均 ≥ 28px');
    await page.click('[data-filters-toggle]');
    await new Promise((r) => setTimeout(r, 520));
  }

  /* 6. 对比度（正文 vs 背景） */
  const contrast = await page.evaluate(() => {
    const parse = (c) => c.match(/[\d.]+/g).map(Number);
    const lum = ([r, g, b]) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const bgOf = (el) => {
      let n = el;
      while (n) {
        const bg = getComputedStyle(n).backgroundColor;
        const p = parse(bg);
        if (p.length >= 3 && (p[3] === undefined || p[3] > 0.5)) return p.slice(0, 3);
        n = n.parentElement;
      }
      return [13, 20, 24];
    };
    const out = [];
    for (const sel of ['.part__desc', '.effect', '.monster__meta', '.filter-row__label', '.vital dt', '.dmg__line']) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const fg = parse(getComputedStyle(el).color).slice(0, 3);
      const bg = bgOf(el);
      const l1 = lum(fg), l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      out.push({ sel, ratio: +ratio.toFixed(2) });
    }
    return out;
  });
  const lowContrast = contrast.filter((c) => c.ratio < 3);
  console.log('    对比度:', contrast.map((c) => `${c.sel}=${c.ratio}`).join(' '));
  if (lowContrast.length) bad(`对比度不足(<3): ${lowContrast.map((c) => `${c.sel}=${c.ratio}`).join(' ')}`);
  else good('正文对比度均 ≥ 3');

  /* 7. 筛选后布局仍然正常 */
  await page.evaluate(() => {
    document.querySelector('.chip[data-group="act"][data-value="react"]')?.click();
  });
  await new Promise((r) => setTimeout(r, 150));
  const afterFilter = await page.evaluate(() => {
    const visible = [...document.querySelectorAll('.monster')].filter((m) => !m.hidden);
    const vw = document.documentElement.clientWidth;
    return {
      visible: visible.length,
      scrollW: document.documentElement.scrollWidth,
      vw,
      allHaveHeader: visible.every((m) => m.querySelector('.monster__head')),
    };
  });
  if (afterFilter.scrollW > afterFilter.vw + 1) bad(`筛选后横向溢出 ${afterFilter.scrollW} > ${afterFilter.vw}`);
  else good(`筛选后仍无溢出（命中 ${afterFilter.visible} 只）`);

  await page.close();
}

await browser.close();
console.log('');
if (fail) { console.error(`❌ ${fail} 项问题`); process.exit(1); }
console.log('✅ 布局检查全部通过');
