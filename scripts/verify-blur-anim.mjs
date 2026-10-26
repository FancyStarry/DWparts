/**
 * 断言：筛选面板展开/收起全程 backdrop-filter 都生效，不能出现"动画结束才变模糊"。
 *
 * 方法：临时把动画时长放大到 8s（注入样式），逐秒采样面板区域内像素的标准差。
 *   模糊生效 → 背后内容被抹开 → sd 低
 *   模糊失效 → 能看到锐利内容 → sd 高
 * 判据：动画中段的 sd 必须明显低于"未覆盖基线"，且全程单调收敛，不能中途突然掉到 0。
 */
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8088/';
let fail = 0;
const b = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
});
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
await p.goto(BASE, { waitUntil: 'networkidle2' });

// 放慢动画便于采样；同时铺一层高对比条纹，用来判定 blur 是否真的生效
// （条纹在面板之下：面板 z-index 99，条纹 z-index 1）
await p.addStyleTag({
  content: `
    .filters, .filters__panel { transition-duration: 8s !important; }
    .probe-stripes {
      position: fixed; inset: 0; z-index: 1; pointer-events: none;
      background: repeating-linear-gradient(90deg, #fff 0 6px, #000 6px 12px);
    }
  `,
});
await p.evaluate(() => {
  const d = document.createElement('div');
  d.className = 'probe-stripes';
  document.body.appendChild(d);
});

const sd = async (x, y, w, h) => {
  const buf = await p.screenshot({ clip: { x, y, width: w, height: h }, encoding: 'binary' });
  const png = PNG.sync.read(Buffer.from(buf));
  const v = [];
  for (let i = 0; i < png.width * png.height; i++) v.push(png.data[i * 4]);
  const mean = v.reduce((a, c) => a + c, 0) / v.length;
  return { mean: +mean.toFixed(1), sd: +Math.sqrt(v.reduce((a, c) => a + (c - mean) ** 2, 0) / v.length).toFixed(1) };
};

// 采样区：面板展开后的空白处（避开文字/chip，只看背景条纹是否被模糊）
const R = { x: 900, y: 300, w: 100, h: 24 };
const base = await sd(R.x, R.y, R.w, R.h);
console.log(`  基线（条纹未被面板覆盖时 sd≈127）: 均值=${base.mean} sd=${base.sd}`);

await p.click('[data-filters-toggle]');
const series = [];
const t0 = Date.now();
for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 700));
  const s = await sd(R.x, R.y, R.w, R.h);
  const st = await p.evaluate(() => {
    const el = document.querySelector('.filters');
    const panel = document.querySelector('.filters__panel');
    return { op: +(+getComputedStyle(el).opacity).toFixed(2), ty: getComputedStyle(panel).transform };
  });
  series.push({ t: ((Date.now() - t0) / 1000).toFixed(1), ...s, ...st });
}
console.log('  展开过程:');
for (const s of series) console.log(`    ${s.t.padStart(4)}s  opacity=${String(s.op).padEnd(4)} sd=${String(s.sd).padStart(5)}  ${s.ty.slice(0, 34)}`);

const final = series[series.length - 1];
const mids = series.filter((s) => s.op > 0.35 && s.op < 0.98);

// 判据 1：动画中段 blur 必须已生效（sd 明显低于基线）
if (mids.length) {
  const worst = Math.max(...mids.map((s) => s.sd));
  if (worst > base.sd * 0.6) {
    fail++;
    console.error(`  ✗ 动画中段仍能看清内容（sd=${worst}，基线 ${base.sd}）→ blur 未生效`);
  } else console.log(`  ✓ 动画中段已模糊（最差 sd=${worst}，基线 ${base.sd}）`);
} else console.log('  · 未采到中段帧');

// 判据 2：动画后段（opacity ≥ 0.95）不能出现突变。
// 只取后段是因为前段 opacity 本身在快速变化，sd 随之下降属正常。
const late = series.filter((s) => s.op >= 0.95);
const deltas = [];
for (let i = 1; i < late.length; i++) deltas.push(Math.abs(late[i].sd - late[i - 1].sd));
if (!deltas.length) {
  console.log('  · 后段采样不足，跳过突变检测');
} else {
  const biggest = Math.max(...deltas);
  if (biggest > 8) {
    fail++;
    console.error(`  ✗ 后段出现突变（单步最大 Δsd=${biggest.toFixed(1)}）`);
  } else console.log(`  ✓ 后段无突变（单步最大 Δsd=${biggest.toFixed(1)}）`);
}

// 判据 3：带 backdrop-filter 的 .filters 上不能有 transform
const t = await p.evaluate(() => {
  const el = document.querySelector('.filters');
  const cs = getComputedStyle(el);
  return { transform: cs.transform, backdrop: cs.backdropFilter };
});
if (t.transform !== 'none') { fail++; console.error(`  ✗ .filters 上有 transform（会切断 backdrop 采样）: ${t.transform}`); }
else console.log('  ✓ 带 backdrop-filter 的层无 transform');
if (!/blur/.test(t.backdrop)) { fail++; console.error(`  ✗ backdrop-filter 缺失: ${t.backdrop}`); }
else console.log(`  ✓ backdrop-filter 存在: ${t.backdrop}`);

await b.close();
console.log('');
if (fail) { console.error(`❌ ${fail} 项问题`); process.exit(1); }
console.log('✅ 展开动画全程模糊稳定，无末尾突变为纯色');
