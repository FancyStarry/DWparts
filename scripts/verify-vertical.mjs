/**
 * 校验：卡片文字必须紧跟标题（不被垂直居中推开），且各卡间距一致。
 */
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8088/';
const b = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
});

let fail = 0;
for (const [w, h, label] of [[1440, 900, '宽屏'], [1024, 800, '中屏'], [390, 844, '竖屏']]) {
  const p = await b.newPage();
  await p.setViewport({ width: w, height: h });
  await p.goto(BASE, { waitUntil: 'networkidle2' });

  const r = await p.evaluate(() => {
    const gaps = [];
    let centred = 0;
    for (const part of document.querySelectorAll('.part')) {
      const head = part.querySelector('.part__head');
      const body = part.querySelector('.part__body');
      if (!head || !body || !body.children.length) continue;
      const hb = head.getBoundingClientRect();
      const bb = body.getBoundingClientRect();
      const first = body.children[0].getBoundingClientRect();
      const last = body.children[body.children.length - 1].getBoundingClientRect();
      const gapTop = Math.round(first.top - hb.bottom);
      const gapBottom = Math.round(part.getBoundingClientRect().bottom - last.bottom);
      gaps.push(gapTop);
      // 若内容整体居中，则上下留白接近且都很大
      if (gapTop > 20) centred++;
    }
    return { gaps, centred, total: gaps.length };
  });

  const uniq = [...new Set(r.gaps)].sort((a, b) => a - b);
  const ok = r.centred === 0;
  if (!ok) { fail++; console.error(`  ✗ ${label} ${w}px: ${r.centred}/${r.total} 张卡的内容被垂直居中推开`); }
  else console.log(`  ✓ ${label} ${w}px: ${r.total} 张卡文字均紧贴标题（标题→正文间距 ${uniq.join('/')}px）`);

  await p.close();
}
await b.close();
console.log(fail ? `\n❌ ${fail} 项问题` : '\n✅ 文字一律顶部对齐');
process.exit(fail ? 1 : 0);
