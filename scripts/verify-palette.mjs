/**
 * 配色一致性：核对渲染结果与设计基准色值是否一致。
 *
 *   node scripts/verify-palette.mjs [baseUrl]
 *
 * 基准值为下列常量，与 src/styles/tokens.css 的定义对应。
 * 修改 tokens.css 后需同步更新本文件的期望值，否则检查会失败。
 */
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8088/';

/* 设计基准值，与 tokens.css 对应 */
const MAIN = {
  pageBg: '#000000',            // --bg-0
  surface: '#0a0a0a',           // --bg-1
  surfaceHover: '#161616',      // --bg-3
  accentLine: '#3a5a6a',        // --line-3 之外的强调色
  divider: 'rgba(255, 255, 255, 0.18)',
  effectsBg: 'rgba(0, 0, 0, 0)',
  text: {
    white: '#ffffff',           // body { color: white }
    lightgray: '#d3d3d3',       // .effects { color: lightgray }
    gray: '#808080',            // .tags { color: gray }
    dim: '#888888',             // .tag_upp { color: #888 }
  },
  gold: '#ffd700',              // .adv { color: gold }
  dmg: {
    phy1: '#c9c9c9', phy2: '#b0b0b0', phy3: '#dcdcdc', phy4: '#dcdcdc',
    ele1: '#ff8c5c', ele2: '#8fa8e8', ele3: '#ffcc4d', ele4: '#b388e8',
    ele5: '#b5dc5c', ele6: '#a8c97d', ele7: '#a8c97d',
    mag1: '#f5e5a0', mag2: '#6fae9b', mag3: '#c84a4a', mag4: '#ffa0c4',
    heal: '#80e0cd',
  },
  semantic: {
    pink: '#ffbbff', blue: '#55aaff', lb: '#00ddff', orange: '#ffcc00',
    green: '#63a440', red: '#ff5555', lgreen: '#55ff55',
  },
};

/* 品牌色 */
const BRAND_ACCENT = '#4fb3d9';

const toRgb = (s) => {
  if (!s) return null;
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    return [Math.round(p[0]), Math.round(p[1]), Math.round(p[2])];
  }
  const h = s.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
};
const dist = (a, b) => {
  const x = toRgb(a), y = toRgb(b);
  if (!x || !y) return 999;
  return Math.max(...x.map((v, i) => Math.abs(v - y[i])));
};

let fail = 0;
const check = (label, actual, expected, tol = 2) => {
  const d = dist(actual, expected);
  if (d <= tol) console.log(`  ✓ ${label}  ${actual}`);
  else { fail++; console.error(`  ✗ ${label}  期望 ${expected}，实际 ${actual}`); }
};

const b = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
});
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
await p.goto(BASE, { waitUntil: 'networkidle2' });

console.log('\n[1/5] 底色与表面');
const surfaces = await p.evaluate(() => {
  const cs = (sel, prop) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[prop] : null; };
  return {
    body: cs('body', 'backgroundColor'),
    part: cs('.part', 'backgroundColor'),
    chip: cs('.chip', 'backgroundColor'),
    effects: cs('.effects', 'backgroundColor'),
    effectsBorder: cs('.effects', 'borderLeftColor'),
    topBar: getComputedStyle(document.documentElement).getPropertyValue('--bg-2').trim(),
  };
});
check('页面底色', surfaces.body, MAIN.pageBg);

console.log('\n[2/5] 文字阶梯');
const texts = await p.evaluate(() => {
  const cs = (sel, prop = 'color') => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[prop] : null; };
  return {
    name: cs('.monster__name'),
    partName: cs('.part__name'),
    desc: cs('.part__desc'),
    effect: cs('.effect'),
    label: cs('.filter-row__label'),
    meta: cs('.monster__meta'),
  };
});
const t = Object.values(texts).map((c) => c);
if (t.some((c) => dist(c, MAIN.text.white) <= 2)) console.log(`  ✓ 标题类为 white`);
else { fail++; console.error('  ✗ 没有元素使用 white'); }
check('效果正文 (lightgray)', texts.effect, MAIN.text.lightgray);
check('说明正文 (lightgray)', texts.desc, MAIN.text.lightgray);

console.log('\n[3/5] 伤害类型色板（16 项）');
const dmg = await p.evaluate(() => {
  const out = {};
  const probe = document.createElement('span');
  document.body.appendChild(probe);
  for (const k of ['phy1','phy2','phy3','phy4','ele1','ele2','ele3','ele4','ele5','ele6','ele7','mag1','mag2','mag3','mag4','heal']) {
    probe.className = k;
    out[k] = getComputedStyle(probe).color;
  }
  probe.remove();
  return out;
});
for (const [k, v] of Object.entries(MAIN.dmg)) check(`.${k}`, dmg[k], v);

console.log('\n[4/5] 语义色（7 项）');
const sem = await p.evaluate(() => {
  const out = {};
  const probe = document.createElement('span');
  document.body.appendChild(probe);
  for (const k of ['pink','blue','lb','orange','green','red','lgreen']) {
    probe.className = k;
    out[k] = getComputedStyle(probe).color;
  }
  probe.remove();
  return out;
});
for (const [k, v] of Object.entries(MAIN.semantic)) check(`.${k}`, sem[k], v);

console.log('\n[5/5] 金色与品牌色');
const accents = await p.evaluate(() => {
  const adv = document.querySelector('.ability.adv dd');
  const wiki = document.querySelector('.site-header__title span');
  return {
    gold: adv ? getComputedStyle(adv).color : null,
    brand: wiki ? getComputedStyle(wiki).color : null,
  };
});
check('.adv 优势数值 (gold)', accents.gold, MAIN.gold);
check('标题 Wiki 品牌蓝（保留）', accents.brand, BRAND_ACCENT);

/* 未被蓝化的灰色检查：任何元素都不该残留旧 token 的蓝灰 */
const leftover = await p.evaluate(() => {
  const old = ['rgb(232, 238, 242)', 'rgb(184, 198, 208)', 'rgb(127, 147, 161)', 'rgb(90, 107, 119)'];
  const hits = [];
  for (const el of document.querySelectorAll('body *')) {
    const c = getComputedStyle(el).color;
    if (old.includes(c)) hits.push(el.className || el.tagName);
  }
  return hits.slice(0, 5);
});
if (leftover.length) { fail++; console.error(`  ✗ 仍有旧蓝灰文字色: ${leftover.join(', ')}`); }
else console.log('  ✓ 无旧蓝灰文字色残留');

await b.close();
console.log('');
if (fail) { console.error(`❌ ${fail} 项与基准色值不一致`); process.exit(1); }
console.log('✅ 渲染配色与设计基准一致');
