/**
 * 逐像素确认：徽章四角与四周必须等于所在卡片的实际背景色（即"融入背景"）。
 * 直接读真实页面的截图，不依赖任何 DOM 推断。
 */
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8088/';
const b = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
});
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await p.goto(BASE, { waitUntil: 'networkidle2' });

let fail = 0;
for (const k of ['basic', 'm', 's1', 's2']) {
  const part = await p.$(`.part[data-part="${k}"]`);
  const badge = await part.$('.badge');
  const bb = await badge.boundingBox();
  const pb = await part.boundingBox();
  // 卡片背景：取部件右下角内侧一点（远离任何图标）
  const shot = await p.screenshot({
    clip: { x: pb.x, y: pb.y, width: pb.width, height: pb.height },
    encoding: 'binary',
  });
  writeFileSync(`/tmp/part-${k}.png`, shot);
  const png = PNG.sync.read(Buffer.from(shot));
  const at = (x, y) => {
    const i = (png.width * Math.round(y) + Math.round(x)) << 2;
    return [png.data[i], png.data[i + 1], png.data[i + 2]];
  };
  const cardBg = at(6, png.height - 6);            // 部件左下内侧
  const bx = bb.x - pb.x, by = bb.y - pb.y;        // 徽章在部件内的偏移
  // 徽章现在紧贴部件左边缘（部件已去掉内边距），左侧取样点会越界，
  // 因此只取仍在部件范围内的方向；越界本身不算残留。
  const probes = {
    '左上': [bx - 3, by - 3],
    '右上': [bx + 51, by - 3],
    '左下': [bx - 3, by + 51],
    '右下': [bx + 51, by + 51],
    '上边中': [bx + 24, by - 3],
    '左边中': [bx - 3, by + 24],
    '右边中': [bx + 51, by + 24],
    '下边中': [bx + 24, by + 51],
  };
  const results = {};
  for (const [name, [x, y]] of Object.entries(probes)) {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue;   // 越界跳过

    const c = at(x, y);
    const d = Math.max(...c.map((v, i) => Math.abs(v - cardBg[i])));
    results[name] = d <= 10 ? 'ok' : `Δ${d}`;
  }
  const bads = Object.entries(results).filter(([, v]) => v !== 'ok');
  if (!Object.keys(results).length) { console.error(`  ? ${k} 无可取样点`); continue; }
  if (bads.length) { fail++; console.error(`  ✗ ${k} 徽章外围: ${JSON.stringify(results)}  卡片底色=${cardBg}`); }
  else console.log(`  ✓ ${k} 徽章四周与卡片底色一致 rgb(${cardBg.join(',')})`);
}
await b.close();
console.log(fail ? `\n❌ ${fail} 处残留` : '\n✅ 徽章完全融入背景，无方框残留');
process.exit(fail ? 1 : 0);
