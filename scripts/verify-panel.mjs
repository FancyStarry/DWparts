/**
 * 悬浮下拉筛选面板断言：
 *   1. 覆盖主内容（不推挤布局，页面高度不变）
 *   2. 滚到任意位置都能展开
 *   3. 收起方向向上，且带非线性缓动
 *   4. 「全部」按钮每组各一个，默认按下
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

for (const [w, h, label] of [[1440, 900, '桌面'], [390, 844, '手机']]) {
  console.log(`\n═══ ${label} ${w}×${h} ═══`);
  const p = await b.newPage();
  await p.setViewport({ width: w, height: h });
  await p.goto(BASE, { waitUntil: 'networkidle2' });

  /* 1. 默认收起 */
  const closed = await p.evaluate(() => {
    const panels = document.querySelectorAll('[data-filters]');
    const panel = document.querySelector('[data-filters]');
    return {
      count: panels.length,
      hidden: panel.hidden,
      open: panel.hasAttribute('data-open'),
      css: getComputedStyle(panel).translate,
    };
  });
  if (closed.count !== 1) bad(`筛选面板数量应为 1，实际 ${closed.count}`);
  if (!closed.hidden || closed.open) bad('面板应默认收起');
  else good(`默认收起（translate ${closed.css}）`);

  /* 2. 底部文字与清空按钮已删除 */
  const removed = await p.evaluate(() => ({
    foot: document.querySelectorAll('.filters__foot').length,
    clearBtn: document.querySelectorAll('[data-clear-filters]').length,
    text: document.body.textContent.includes('同组多选取并集'),
  }));
  if (removed.foot || removed.clearBtn || removed.text) bad(`底部容器/清空按钮未清除 ${JSON.stringify(removed)}`);
  else good('底部说明容器与「清空全部筛选」已移除');

  /* 3. 每组都有「全部」，且默认按下 */
  const alls = await p.evaluate(() => {
    const groups = [...document.querySelectorAll('.filter-row')].map((row) => {
      const all = row.querySelector('.chip--all');
      return {
        label: row.querySelector('.filter-row__label')?.textContent,
        hasAll: Boolean(all),
        pressed: all?.getAttribute('aria-pressed') === 'true',
        isFirst: row.querySelector('.filter-row__values')?.firstElementChild?.classList.contains('chip--all'),
      };
    });
    return groups;
  });
  const missing = alls.filter((g) => !g.hasAll || !g.isFirst);
  if (missing.length) bad(`缺「全部」或不在首位: ${JSON.stringify(missing.map((x) => x.label))}`);
  else if (!alls.every((g) => g.pressed)) bad('「全部」默认未按下');
  else good(`${alls.length} 个类别全部有「全部」且位于首位、默认按下`);

  /* 4. 滚到页面中部再展开，验证覆盖而非推挤 */
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.5));
  await new Promise((r) => setTimeout(r, 200));
  const beforeH = await p.evaluate(() => document.documentElement.scrollHeight);

  await p.click('[data-filters-toggle]');
  await new Promise((r) => setTimeout(r, 520));   // 等动画结束

  const opened = await p.evaluate(() => {
    const panel = document.querySelector('[data-filters]');
    const r = panel.getBoundingClientRect();
    const header = document.querySelector('.site-header').getBoundingClientRect();
    const content = document.querySelector('.content').getBoundingClientRect();
    return {
      open: panel.hasAttribute('data-open'),
      hidden: panel.hidden,
      top: Math.round(r.top),
      headerBottom: Math.round(header.bottom),
      height: Math.round(r.height),
      viewport: window.innerHeight,
      // 页面滚到中部时 .content 顶部在视口上方（负值），不能用坐标比较；
      // 直接看面板范围内的命中元素是不是面板自己（是则说明浮在内容之上）
      hitBelongs: (() => {
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 30);
        return Boolean(hit && panel.contains(hit));
      })(),
      hitOutOfPanel: (() => {
        // 面板下边缘再往下一段应命中页面内容，证明面板是独立浮层
        const y = Math.min(window.innerHeight - 5, r.bottom + 40);
        const hit = document.elementFromPoint(r.left + r.width / 2, y);
        return hit ? (hit.className || hit.tagName) : null;
      })(),
      position: getComputedStyle(panel).position,
      scrollY: Math.round(window.scrollY),
      scrollHeight: document.documentElement.scrollHeight,
      transition: getComputedStyle(panel).transition,
      opacity: getComputedStyle(panel).opacity,
      zIndex: getComputedStyle(panel).zIndex,
    };
  });
  if (!opened.open || opened.hidden) bad('点击后面板未展开');
  else good('面板已展开');
  if (opened.top < opened.headerBottom - 2) bad(`面板遮住了顶栏（top=${opened.top} < header=${opened.headerBottom}）`);
  else good(`紧贴顶栏下方展开（top=${opened.top}）`);
  if (!opened.hitBelongs) bad('面板区域命中的不是面板本身，可能被内容遮挡');
  else if (opened.position !== 'fixed') bad(`面板不是浮层（position=${opened.position}）`);
  else good('覆盖主内容（fixed 定位，面板区域命中的是面板自身）');
  if (Math.abs(opened.scrollHeight - beforeH) > 2) bad(`展开改变了页面高度（${beforeH} → ${opened.scrollHeight}）`);
  else good(`页面高度不变（${opened.scrollHeight}px），是浮层`);
  if (opened.scrollY < 100) console.log('    （注意：本次滚动位置较浅）');
  else good(`在滚动 ${opened.scrollY}px 处仍可展开`);
  if (!/cubic-bezier|ease-out|ease-in-out/.test(opened.transition)) bad(`过渡不是非线性: ${opened.transition}`);
  else good('非线性缓动已应用');

  /* 5. 收起：方向向上 + 动画可见 */
  const mid = await p.evaluate(async () => {
    const filters = document.querySelector('[data-filters]');
    const panel = document.querySelector('.filters__panel');
    const ty = () => {
      const m = getComputedStyle(panel).transform;
      return m === 'none' ? 0 : parseFloat(m.split(',')[5]);
    };
    document.querySelector('[data-filters-toggle]').click();
    // 收起动画 420ms，hidden 在 400ms 后才设，所以要在这之前读
    await new Promise((r) => setTimeout(r, 150));
    const midTy = ty();
    const midOpacity = +getComputedStyle(filters).opacity;
    await new Promise((r) => setTimeout(r, 200));   // 累计 350ms
    const lateTy = ty();
    await new Promise((r) => setTimeout(r, 400));   // 累计 750ms，已隐藏
    return { midTy, midOpacity, lateTy, hidden: filters.hidden };
  });
  if (!(mid.midTy < -20)) bad(`收起过程中没有向上滑出（translateY=${mid.midTy}）`);
  else good(`收起时向上滑出（中间帧 translateY=${mid.midTy}px）`);
  if (!(mid.lateTy < mid.midTy)) bad(`收起方向不对（${mid.midTy} → ${mid.lateTy}）`);
  else good(`持续向上（350ms 时 translateY=${mid.lateTy}px）`);
  if (!(mid.midOpacity < 0.99)) bad(`收起时没有淡出（opacity=${mid.midOpacity}）`);
  else good(`同步淡出（中间帧 opacity ${mid.midOpacity}）`);
  if (!mid.hidden) bad('动画结束后未重置 hidden');
  else good('动画结束后正确隐藏');

  /* 6. 点击面板外部收起 */
  await p.click('[data-filters-toggle]');
  await new Promise((r) => setTimeout(r, 500));
  await p.mouse.click(w / 2, h - 40);
  await new Promise((r) => setTimeout(r, 500));
  const outside = await p.evaluate(() => document.querySelector('[data-filters]').hasAttribute('data-open'));
  if (outside) bad('点击外部未收起');
  else good('点击外部自动收起');

  await p.close();
}

await b.close();
console.log('');
if (fail) { console.error(`❌ ${fail} 项问题`); process.exit(1); }
console.log('✅ 悬浮筛选面板行为全部符合预期');
