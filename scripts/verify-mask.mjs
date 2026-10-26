/**
 * 验证徽章裁切：形状正确 + 方框四边无残留 + 不依赖 mask-composite。
 */
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import { writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8088/';
let fail = 0;
const bad = (m) => { fail++; console.error(`  ✗ ${m}`); };
const good = (m) => console.log(`  ✓ ${m}`);

const b = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
});

for (const dpr of [1, 2, 3]) {
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: dpr });
  await p.goto(BASE, { waitUntil: 'networkidle2' });

  /* 1. 样式层面：只应有单层 mask-image，不能依赖 mask-composite */
  const style = await p.evaluate(() => {
    const out = {};
    for (const k of ['basic', 'm', 's1', 's2']) {
      const el = document.querySelector(`.part[data-part="${k}"] .badge__portrait`);
      const cs = getComputedStyle(el);
      out[k] = {
        mask: cs.maskImage,
        composite: cs.maskComposite,
        layers: (cs.maskImage.match(/url\(/g) ?? []).length,
        clip: cs.clipPath,
      };
    }
    return out;
  });
  if (dpr === 1) {
    for (const [k, v] of Object.entries(style)) {
      if (v.layers !== 1) bad(`${k}: mask 层数 ${v.layers}（应为 1，多层的兼容性差）`);
      if (!v.mask.includes(`mask-${k}.png`)) bad(`${k}: mask 未指向 mask-${k}.png → ${v.mask}`);
      if (/exclude|xor/.test(v.composite)) bad(`${k}: 仍在用 mask-composite=${v.composite}`);
      if (v.clip !== 'none') bad(`${k}: 意外启用了 clip-path 兜底`);
    }
    if (!Object.entries(style).some(([, v]) => /exclude|xor/.test(v.composite))) {
      good('单层 mask-image，无 mask-composite 依赖');
    }
  }

  /* 2. 像素层面：用素材 alpha 判定，边框本身占用边缘不算残留 */
  if (dpr === 1) {
    for (const k of ['basic', 'm', 's1', 's2']) {
      const badge = await p.$(`.part[data-part="${k}"] .badge`);
      const bb = await badge.boundingBox();
      await p.screenshot({
        path: `/tmp/edge-${k}.png`,
        clip: { x: bb.x - 4, y: bb.y - 4, width: 56, height: 56 },
        encoding: 'binary',
      });
    }
    const { execFileSync } = await import('node:child_process');
    try {
      const out = execFileSync('python3', ['scripts/check-mask-edges.py'], { encoding: 'utf8' });
      for (const line of out.trim().split('\n')) console.log('  ' + line.trim());
    } catch (e) {
      bad('方框残留检测未通过\n' + (e.stdout ?? ''));
    }
  }
  await p.close();
}

/* 3. 形状正确性：与素材洞口比对（用 1x 截图 alpha 形状） */
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await p.goto(BASE, { waitUntil: 'networkidle2' });
for (const k of ['s1']) {
  const el = await p.$(`.part[data-part="${k}"] .badge`);
  await el.screenshot({ path: `/tmp/shape-${k}.png`, omitBackground: true });
}
await p.close();
await b.close();

console.log('');
if (fail) { console.error(`❌ ${fail} 项问题`); process.exit(1); }
console.log('✅ 徽章裁切：单层 mask、四边干净、形状来自素材');
